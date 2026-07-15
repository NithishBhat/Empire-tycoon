import React, { useState } from 'react'
import {
  IDLE_BUSINESSES, FLEET_BUSINESSES, SLOT_PACKS, CONSTRUCTION, DEALERSHIP,
  BANK, IT_COMPANY, FOOTBALL, OIL, MAX_LEVEL, ROUTES,
  PRICE_MIN, PRICE_MAX, MANAGER_COST, MANAGER_SALARY_PCT,
  MARKETING_COST_PCT, MARKETING_HOURS, LEVEL_INCOME_GROWTH,
  WORKSHOP_MAX, DEMAND_MIN, DEMAND_MAX,
} from '../game/data.js'
import {
  idleIncome, upgradeCost, bankFlows, footballRating, playerCost,
  effectiveDemand, optimalPrice, idleRevenue, fleetVehicleNet, fleetWearPerHour,
  workshopCost, getRoute,
} from '../game/engine.js'
import { fmt } from '../format.js'

// Catalog of every business for the list view
const CATALOG = [
  ...IDLE_BUSINESSES.map(b => ({ id: b.id, kind: 'idle', icon: b.icon, name: b.name, cost: b.cost, desc: `Consumer business · demand & pricing game · from ${fmt(b.baseIncome)}/hr` })),
  ...FLEET_BUSINESSES.map(b => ({ id: b.id, kind: 'fleet', icon: b.icon, name: b.name, cost: b.cost, desc: 'Fleet business · routes, fuel costs & vehicle wear' })),
  { id: 'construction', kind: 'construction', icon: CONSTRUCTION.icon, name: CONSTRUCTION.name, cost: CONSTRUCTION.cost, desc: 'Project business · crews, materials, crew skill grows' },
  { id: 'dealership', kind: 'dealership', icon: DEALERSHIP.icon, name: DEALERSHIP.name, cost: DEALERSHIP.cost, desc: 'Flipping business · buy, repair, sell' },
  { id: 'bank', kind: 'bank', icon: BANK.icon, name: BANK.name, cost: BANK.cost, desc: 'Rate-setting business · earn the deposit/credit spread' },
  { id: 'it', kind: 'it', icon: IT_COMPANY.icon, name: IT_COMPANY.name, cost: IT_COMPANY.cost, desc: 'Project business · salaries always drain, train seniority' },
  { id: 'football', kind: 'football', icon: FOOTBALL.icon, name: FOOTBALL.name, cost: FOOTBALL.cost, desc: 'Prestige business · squad rating & sponsors' },
  { id: 'oil', kind: 'oil', icon: OIL.icon, name: OIL.name, cost: OIL.cost, desc: 'Endgame business · contracts compound +11% forever' },
]

// Social proof (halo effect + specific, non-round counts). Flavor for the shop only.
const PROOF = {
  smallShop:  { badge: { cls: 'best', text: '★ Bestseller' }, social: '4.9 ★ · 18,204 founders' },
  restaurant: { badge: { cls: 'hot',  text: '🔥 Popular' },   social: '4.7 ★ · 9,863 founders' },
  taxi:       { social: '4.5 ★ · 7,412 founders' },
  shipping:   { social: '4.4 ★ · 6,190 founders' },
  smallFactory:{ social: '4.6 ★ · 8,057 founders' },
  bank:       { social: '4.6 ★ · 3,188 founders' },
  it:         { social: '4.3 ★ · 5,006 founders' },
  football:   { social: '4.8 ★ · 1,942 founders' },
  oil:        { badge: { cls: 'top', text: '👑 Top earner' }, social: 'owned by 96% of billionaires' },
}

// Loss aversion: an affordable upgrade the player hasn't taken = income left on the table.
function upgradeLeak(state, c) {
  if (c.kind !== 'idle') return null
  const biz = IDLE_BUSINESSES.find(b => b.id === c.id)
  const o = state.idle[c.id]
  if (!o || o.level >= MAX_LEVEL) return null
  const cost = upgradeCost(biz, o.level)
  if (state.cash < cost) return null
  const delta = idleIncome(biz, o.level + 1) - idleIncome(biz, o.level)
  return delta > 0 ? { delta } : null
}

function isOwned(state, c) {
  if (c.kind === 'idle') return !!state.idle[c.id]
  if (c.kind === 'fleet') return !!state.fleets[c.id]
  return !!state[c.id]
}

function buyAction(c) {
  return {
    idle: { type: 'BUY_IDLE', id: c.id }, fleet: { type: 'BUY_FLEET', id: c.id },
    construction: { type: 'BUY_CONSTRUCTION' }, dealership: { type: 'BUY_DEALERSHIP' },
    bank: { type: 'BUY_BANK' }, it: { type: 'BUY_IT' },
    football: { type: 'BUY_FOOTBALL' }, oil: { type: 'BUY_OIL' },
  }[c.kind]
}

export default function Businesses({ state, dispatch, incomes }) {
  const [open, setOpen] = useState(null) // catalog id of business being managed

  if (open) {
    const c = CATALOG.find(x => x.id === open)
    const stillOwned = isOwned(state, c)
    if (!stillOwned) { setOpen(null); return null }
    return (
      <>
        <button className="btn ghost back" onClick={() => setOpen(null)}>← All businesses</button>
        {c.kind === 'idle' && <IdlePage biz={IDLE_BUSINESSES.find(b => b.id === c.id)} state={state} dispatch={dispatch} />}
        {c.kind === 'fleet' && <FleetPage fb={FLEET_BUSINESSES.find(b => b.id === c.id)} state={state} dispatch={dispatch} income={incomes[c.id] || 0} />}
        {c.kind === 'construction' && <ConstructionPage c={state.construction} cash={state.cash} dispatch={dispatch} />}
        {c.kind === 'dealership' && <DealershipPage d={state.dealership} cash={state.cash} dispatch={dispatch} />}
        {c.kind === 'bank' && <BankPage b={state.bank} dispatch={dispatch} />}
        {c.kind === 'it' && <ITPage it={state.it} cash={state.cash} dispatch={dispatch} />}
        {c.kind === 'football' && <FootballPage f={state.football} cash={state.cash} dispatch={dispatch} />}
        {c.kind === 'oil' && <OilPage o={state.oil} dispatch={dispatch} />}
      </>
    )
  }

  const owned = CATALOG.filter(c => isOwned(state, c))
  const forSale = CATALOG.filter(c => !isOwned(state, c))

  return (
    <>
      {owned.length > 0 && <>
        <div className="section-title">Your empire — {owned.length} {owned.length === 1 ? 'business' : 'businesses'} you built · click to manage</div>
        <div className="bizlist">
          {owned.map(c => {
            const leak = upgradeLeak(state, c)
            return (
              <button key={c.id} className="bizrow owned" onClick={() => setOpen(c.id)}>
                <span className="biz-icon">{c.icon}</span>
                <span className="biz-name">
                  <b>{c.name}{leak && <span className="leak">+{fmt(leak.delta)}/hr upgrade ready</span>}</b>
                  <OwnedSummary c={c} state={state} />
                </span>
                <span className="biz-income up">{fmt(incomes[c.id] || 0)}/hr</span>
                <span className="chev">›</span>
              </button>
            )
          })}
        </div>
      </>}

      <div className="section-title">Start a business</div>
      <div className="bizlist">
        {forSale.map(c => {
          const can = state.cash >= c.cost
          const p = PROOF[c.id]
          return (
            <div key={c.id} className={`bizrow ${can ? 'can' : 'cant'}`}>
              <span className="biz-icon">{c.icon}</span>
              <span className="biz-name">
                <b>{c.name}{p?.badge && <span className={`proof ${p.badge.cls}`}>{p.badge.text}</span>}</b>
                <span>{c.desc}{p?.social && <> · <span className="social-count">{p.social}</span></>}</span>
              </span>
              <span className="biz-cost">{fmt(c.cost)}</span>
              <button className="btn buy small" disabled={!can} onClick={() => dispatch(buyAction(c))}>Open</button>
            </div>
          )
        })}
      </div>
    </>
  )
}

function OwnedSummary({ c, state }) {
  if (c.kind === 'idle') {
    const o = state.idle[c.id]
    const d = effectiveDemand(state, c.id)
    return <span>lvl {o.level} · demand {(d * 100).toFixed(0)}% · price {o.manager ? 'auto' : `${o.price}%`}</span>
  }
  if (c.kind === 'fleet') {
    const f = state.fleets[c.id]
    return <span>{f.vehicles.length}/{f.slots} vehicles · {getRoute(f).name}</span>
  }
  if (c.kind === 'construction') { const x = state.construction; return <span>{x.workers} workers · {x.completed || 0} projects done{x.ready ? ' · 💰 payment ready' : ''}</span> }
  if (c.kind === 'dealership') { const x = state.dealership; return <span>{x.car ? (x.car.repaired ? '🚗 ready to sell' : 'repairing…') : 'lot is empty'}</span> }
  if (c.kind === 'bank') { const x = state.bank; return <span>vault {fmt(x.vault)} · spread {(x.creditRate - x.depositRate).toFixed(1)}%</span> }
  if (c.kind === 'it') { const x = state.it; return <span>{x.devs} devs · seniority {x.seniority || 0}/{IT_COMPANY.trainMax}{x.project ? ' · shipping…' : ''}</span> }
  if (c.kind === 'football') { const x = state.football; return <span>rating {footballRating(x)} · {x.players}/{FOOTBALL.maxPlayers} squad</span> }
  if (c.kind === 'oil') { const x = state.oil; return <span>{x.contracts} contracts{x.contractLeftH > 0 ? ' · contract running' : ''}</span> }
  return null
}

// ---------- Idle business management page ----------
function IdlePage({ biz, state, dispatch }) {
  const o = state.idle[biz.id]
  const demand = effectiveDemand(state, biz.id)
  const best = optimalPrice(demand)
  const revenue = idleRevenue(biz, o, demand)
  const cost = upgradeCost(biz, o.level)
  const mktCost = biz.baseIncome * MARKETING_COST_PCT * Math.pow(LEVEL_INCOME_GROWTH, o.level - 1)
  const price = o.manager ? best : o.price
  const customers = Math.max(0.1, demand + 1 - price / 100)
  const demandPct = ((demand - DEMAND_MIN) / (DEMAND_MAX - DEMAND_MIN)) * 100

  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{biz.icon} {biz.name} <span className="tksym">lvl {o.level}</span></h2>
          <div className="det-price">{fmt(revenue)}/hr</div>
        </div>
        {o.marketingLeftH > 0 && <span className="pill gold">📣 campaign live {o.marketingLeftH.toFixed(0)}h</span>}
      </div>

      <div className="det-stats">
        <div><span className="label">Demand</span><b className={demand >= 1 ? 'up' : 'down'}>{(demand * 100).toFixed(0)}%</b></div>
        <div><span className="label">Your price</span><b>{price}%</b></div>
        <div><span className="label">Customers</span><b>{(customers * 100).toFixed(0)}%</b></div>
        <div><span className="label">Sweet spot</span><b>{best}%</b></div>
        <div><span className="label">Base income</span><b>{fmt(idleIncome(biz, o.level))}/hr</b></div>
      </div>

      <div className="lever">
        <div className="row"><span className="sub">Market demand (drifts with the economy — reprice to follow it)</span></div>
        <div className="demandbar"><div style={{ left: `${demandPct}%` }} /></div>
        <div className="minmax"><span>slow market</span><span>booming</span></div>
      </div>

      <div className="lever">
        <div className="row">
          <span className="sub">Price level — higher price, fewer customers. Revenue peaks near the sweet spot.</span>
          <b>{price}%</b>
        </div>
        <input type="range" min={PRICE_MIN} max={PRICE_MAX} value={price} disabled={o.manager}
          onChange={e => dispatch({ type: 'SET_PRICE', id: biz.id, price: +e.target.value })} />
        {o.manager && <div className="sub">🧑‍💼 Your manager keeps the price at the sweet spot automatically (fee {MANAGER_SALARY_PCT * 100}% of revenue).</div>}
      </div>

      <div className="row levers">
        <button className="btn small" disabled={o.level >= MAX_LEVEL || state.cash < cost} onClick={() => dispatch({ type: 'UPGRADE_IDLE', id: biz.id })}>
          Upgrade to lvl {o.level + 1} <span className="grow-to">+{fmt(idleIncome(biz, o.level + 1) - idleIncome(biz, o.level))}/hr</span> · {fmt(cost)}
        </button>
        {o.manager
          ? <button className="btn small sell" onClick={() => dispatch({ type: 'FIRE_MANAGER', id: biz.id })}>Fire manager</button>
          : <button className="btn small" disabled={state.cash < MANAGER_COST} onClick={() => dispatch({ type: 'HIRE_MANAGER', id: biz.id })}>Hire manager · {fmt(MANAGER_COST)}</button>}
        <button className="btn small gold" disabled={(o.marketingCdH || 0) > 0 || state.cash < mktCost} onClick={() => dispatch({ type: 'START_MARKETING', id: biz.id })}>
          {(o.marketingCdH || 0) > 0 ? `Marketing cooldown ${Math.ceil(o.marketingCdH)}h` : `Marketing +30% demand ${MARKETING_HOURS}h · ${fmt(mktCost)}`}
        </button>
      </div>
    </div>
  )
}

// ---------- Fleet management page ----------
function FleetPage({ fb, state, dispatch, income }) {
  const f = state.fleets[fb.id]
  const route = getRoute(f)
  const fuel = state.economy?.fuelPrice ?? 1

  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{fb.icon} {fb.name} <span className="tksym">{f.vehicles.length}/{f.slots} slots</span></h2>
          <div className="det-price">{fmt(income)}/hr <span className="sub">net of fuel</span></div>
        </div>
        <span className={`pill ${fuel > 1.15 ? '' : 'green'}`}>⛽ fuel index {(fuel * 100).toFixed(0)}%</span>
      </div>

      <div className="lever">
        <div className="row"><span className="sub">Route assignment — earn more, wear faster, burn more fuel</span></div>
        <div className="routes">
          {ROUTES.map(r => (
            <button key={r.id} className={`route ${f.route === r.id ? 'sel' : ''}`} onClick={() => dispatch({ type: 'SET_ROUTE', id: fb.id, route: r.id })}>
              <b>{r.name}</b>
              <span>income ×{r.income} · wear ×{r.wear} · fuel ×{r.fuel}</span>
              <span className="sub">{r.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="det-stats">
        <div><span className="label">Workshop</span><b>lvl {f.workshop || 0}/{WORKSHOP_MAX}</b></div>
        <div><span className="label">Wear reduction</span><b>-{((f.workshop || 0) * 6)}%</b></div>
        <div><span className="label">Fuel cost</span><b>{fmt(f.vehicles.reduce((s2, v) => { const t = fb.vehicles.find(t => t.id === v.typeId); return s2 + (v.milesLeft > 0 ? fleetVehicleNet(t, route, fuel).fuel : 0) }, 0))}/hr</b></div>
      </div>
      <div className="row levers">
        <button className="btn small" disabled={(f.workshop || 0) >= WORKSHOP_MAX || state.cash < workshopCost(f.workshop || 0)} onClick={() => dispatch({ type: 'UPGRADE_WORKSHOP', id: fb.id })}>
          Upgrade workshop · {fmt(workshopCost(f.workshop || 0))}
        </button>
        {SLOT_PACKS.map((p, i) => (
          <button key={i} className="btn small ghost" disabled={state.cash < p.cost} onClick={() => dispatch({ type: 'EXPAND_SLOTS', id: fb.id, pack: i })}>+{p.count} slots · {fmt(p.cost)}</button>
        ))}
      </div>

      <div className="section-title">Garage</div>
      {fb.vehicles.map(t => {
        const mine = f.vehicles.filter(v => v.typeId === t.id)
        const net = fleetVehicleNet(t, route, fuel)
        const wear = fleetWearPerHour(t, route, f.workshop)
        return (
          <div className="row garage" key={t.id}>
            <span className="sub">
              <b>{t.name}</b> {mine.length > 0 && <span className="pill green">×{mine.length}</span>}<br />
              net {fmt(net.net)}/hr · lasts ~{Math.round(t.miles / wear)}h on this route
            </span>
            <button className="btn small buy" disabled={state.cash < t.cost || f.vehicles.length >= f.slots} onClick={() => dispatch({ type: 'BUY_VEHICLE', id: fb.id, vehicleId: t.id })}>{fmt(t.cost)}</button>
          </div>
        )
      })}
      {f.vehicles.length > 0 && (
        <div className="sub">Fleet health: {f.vehicles.map((v, i) => {
          const t = fb.vehicles.find(t => t.id === v.typeId)
          return <span key={i} className="pill" style={{ marginRight: 4 }}>{Math.round((v.milesLeft / t.miles) * 100)}%</span>
        })}</div>
      )}
    </div>
  )
}

// ---------- Managed business pages ----------
function ConstructionPage({ c, cash, dispatch }) {
  const proj = c.project ? CONSTRUCTION.projects.find(p => p.id === c.project.id) : null
  const skill = Math.min(CONSTRUCTION.skillCap, (c.completed || 0) * CONSTRUCTION.skillPerProject)
  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{CONSTRUCTION.icon} {CONSTRUCTION.name}</h2>
          <div className="det-price">{fmt(c.lifetime)} <span className="sub">lifetime</span></div>
        </div>
        <span className="pill gold">crew skill +{Math.round(skill * 100)}% payouts</span>
      </div>
      <div className="det-stats">
        <div><span className="label">Workers</span><b>{c.workers}</b></div>
        <div><span className="label">Projects done</span><b>{c.completed || 0}</b></div>
        <div><span className="label">Skill bonus</span><b>+{Math.round(skill * 100)}%</b></div>
      </div>
      {c.ready > 0 && (
        <div className="row">
          <span className="money green">Payment ready: {fmt(c.ready)}</span>
          <button className="btn gold small" onClick={() => dispatch({ type: 'COLLECT_PROJECT' })}>Collect</button>
        </div>
      )}
      <div className="row levers">
        <button className="btn small" disabled={cash < CONSTRUCTION.workerCost} onClick={() => dispatch({ type: 'HIRE_WORKER' })}>Hire worker · {fmt(CONSTRUCTION.workerCost)}</button>
      </div>
      {proj ? (
        <>
          <div className="sub">Building {proj.name} — {c.project.remainH.toFixed(1)}h left</div>
          <div className="bar"><div style={{ width: `${(1 - c.project.remainH / proj.hours) * 100}%` }} /></div>
        </>
      ) : (
        <>
          <div className="section-title">Available projects</div>
          {CONSTRUCTION.projects.map(p => (
            <div className="row" key={p.id}>
              <span className="sub">{p.name} · {p.workers}👷 · {p.hours}h → <b className="money green">{fmt(Math.round(p.payout * (1 + skill)))}</b></span>
              <button className="btn small" disabled={c.workers < p.workers || cash < p.materials} onClick={() => dispatch({ type: 'START_PROJECT', id: p.id })}>Materials {fmt(p.materials)}</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function DealershipPage({ d, cash, dispatch }) {
  return (
    <div className="manage card">
      <h2>{DEALERSHIP.icon} {DEALERSHIP.name}</h2>
      {d.car ? (
        <>
          <div className="row">
            <span className="sub">{d.car.brand} · bought {fmt(d.car.cost)}</span>
            {d.car.repaired
              ? <button className="btn gold small" onClick={() => dispatch({ type: 'SELL_CAR' })}>Sell · {fmt(Math.round(d.car.cost * DEALERSHIP.saleMultiplier))}</button>
              : <span className="pill">🔧 repairing {d.car.repairLeftH.toFixed(1)}h</span>}
          </div>
          {!d.car.repaired && <div className="bar"><div style={{ width: `${(1 - d.car.repairLeftH / DEALERSHIP.repairHours) * 100}%` }} /></div>}
        </>
      ) : (
        <div className="row">
          <span className="sub">Buy a random used car ({fmt(DEALERSHIP.minCar)}–{fmt(DEALERSHIP.maxCar)} + 22% repair), flip at ×{DEALERSHIP.saleMultiplier}</span>
          <button className="btn small buy" disabled={cash < DEALERSHIP.maxCar * 1.25} onClick={() => dispatch({ type: 'BUY_USED_CAR' })}>Buy a car</button>
        </div>
      )}
    </div>
  )
}

function BankPage({ b, dispatch }) {
  const { profit, deposits, loans } = bankFlows(b)
  const spread = b.creditRate - b.depositRate
  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{BANK.icon} {BANK.name}</h2>
          <div className="det-price">{fmt(profit)}/hr <span className="sub">to vault</span></div>
        </div>
        <span className={`pill ${spread > BANK.trustSpread ? '' : 'green'}`}>{spread > BANK.trustSpread ? '⚠ depositors fleeing' : '✓ trusted'}</span>
      </div>
      <div className="lever">
        <div className="row"><span className="sub">Deposit rate — pulls deposits in</span><b>{b.depositRate.toFixed(1)}%</b></div>
        <input type="range" min="0" max={BANK.maxRate} step="0.5" value={b.depositRate}
          onChange={e => dispatch({ type: 'SET_RATES', depositRate: +e.target.value, creditRate: b.creditRate })} />
        <div className="row"><span className="sub">Credit rate — what borrowers pay you</span><b>{b.creditRate.toFixed(1)}%</b></div>
        <input type="range" min="0" max={BANK.maxRate} step="0.5" value={b.creditRate}
          onChange={e => dispatch({ type: 'SET_RATES', depositRate: b.depositRate, creditRate: +e.target.value })} />
      </div>
      <div className="det-stats">
        <div><span className="label">Deposits</span><b>{fmt(deposits)}</b></div>
        <div><span className="label">Loans out</span><b>{fmt(loans)}</b></div>
        <div><span className="label">Spread</span><b>{spread.toFixed(1)}% (max safe {BANK.trustSpread}%)</b></div>
        <div><span className="label">Vault</span><b className="up">{fmt(b.vault)}</b></div>
      </div>
      <div className="row levers">
        <button className="btn gold small" disabled={b.vault < 1} onClick={() => dispatch({ type: 'COLLECT_VAULT' })}>Collect vault · {fmt(b.vault)}</button>
      </div>
    </div>
  )
}

function ITPage({ it, cash, dispatch }) {
  const proj = it.project ? IT_COMPANY.projects.find(p => p.id === it.project.id) : null
  const sen = it.seniority || 0
  const trainCost = IT_COMPANY.trainBaseCost * Math.pow(IT_COMPANY.trainCostGrowth, sen)
  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{IT_COMPANY.icon} {IT_COMPANY.name}</h2>
          <div className="det-price down">-{fmt(it.devs * IT_COMPANY.devSalary)}/hr <span className="sub">salaries</span></div>
        </div>
        <span className="pill gold">seniority {sen}/{IT_COMPANY.trainMax} · +{Math.round(sen * IT_COMPANY.trainBonus * 100)}% payouts</span>
      </div>
      <div className="row levers">
        <button className="btn small" onClick={() => dispatch({ type: 'HIRE_DEV' })}>Hire dev</button>
        <button className="btn small sell" disabled={it.devs <= 0} onClick={() => dispatch({ type: 'FIRE_DEV' })}>Fire dev</button>
        <button className="btn small" disabled={sen >= IT_COMPANY.trainMax || cash < trainCost} onClick={() => dispatch({ type: 'TRAIN_DEVS' })}>Train team · {fmt(trainCost)}</button>
        <button className="btn small sell" onClick={() => dispatch({ type: 'SELL_IT' })}>Sell company (-30%)</button>
      </div>
      <div className="det-stats">
        <div><span className="label">Developers</span><b>{it.devs}</b></div>
        <div><span className="label">Burn rate</span><b className="down">{fmt(it.devs * IT_COMPANY.devSalary)}/hr</b></div>
      </div>
      {proj ? (
        <>
          <div className="sub">Shipping {proj.name} — {it.project.remainH.toFixed(1)}h left → {fmt(Math.round(proj.payout * (1 + sen * IT_COMPANY.trainBonus)))}</div>
          <div className="bar"><div style={{ width: `${(1 - it.project.remainH / proj.hours) * 100}%` }} /></div>
        </>
      ) : (
        <>
          <div className="section-title">Available projects</div>
          {IT_COMPANY.projects.map(p => (
            <div className="row" key={p.id}>
              <span className="sub">{p.name} · {p.devs}💻 · {p.hours}h → <b className="money green">{fmt(Math.round(p.payout * (1 + sen * IT_COMPANY.trainBonus)))}</b></span>
              <button className="btn small" disabled={it.devs < p.devs} onClick={() => dispatch({ type: 'START_IT_PROJECT', id: p.id })}>Start</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function FootballPage({ f, cash, dispatch }) {
  const rating = footballRating(f)
  const pc = playerCost(f)
  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{FOOTBALL.icon} {FOOTBALL.name}</h2>
          <div className="det-price">{fmt(rating * FOOTBALL.incomePerRating * (f.sponsorLeftH > 0 ? FOOTBALL.sponsorMult : 1))}/hr</div>
        </div>
        <span className="pill gold">rating {rating}</span>
      </div>
      <div className="det-stats">
        <div><span className="label">Squad</span><b>{f.players}/{FOOTBALL.maxPlayers}</b></div>
        <div><span className="label">Sponsor</span><b>{f.sponsorLeftH > 0 ? `${f.sponsorLeftH.toFixed(0)}h left (×${FOOTBALL.sponsorMult})` : 'none'}</b></div>
      </div>
      <div className="row levers">
        <button className="btn small buy" disabled={cash < pc || f.players >= FOOTBALL.maxPlayers} onClick={() => dispatch({ type: 'SIGN_PLAYER' })}>Sign player (+{FOOTBALL.ratingPerPlayer}) · {fmt(pc)}</button>
        <button className="btn small gold" disabled={f.sponsorLeftH > 0 || cash < FOOTBALL.sponsorCost} onClick={() => dispatch({ type: 'SIGN_SPONSOR' })}>Sponsor ×{FOOTBALL.sponsorMult} for {FOOTBALL.sponsorHours}h · {fmt(FOOTBALL.sponsorCost)}</button>
      </div>
    </div>
  )
}

function OilPage({ o, dispatch }) {
  return (
    <div className="manage card">
      <div className="det-head">
        <div>
          <h2>{OIL.icon} {OIL.name}</h2>
          <div className="det-price">{fmt(o.income)}/hr</div>
        </div>
        <span className="pill gold">{o.contracts} contracts · ×{Math.pow(OIL.contractIncomeMult, o.contracts).toFixed(2)} base</span>
      </div>
      {o.contractLeftH > 0 ? (
        <>
          <div className="sub">Supply contract in progress — {o.contractLeftH.toFixed(1)}h left (+11% income on completion)</div>
          <div className="bar gold"><div style={{ width: `${(1 - o.contractLeftH / OIL.contractHours) * 100}%` }} /></div>
        </>
      ) : (
        <div className="row">
          <span className="sub">Sign a {OIL.contractHours}h supply contract → income ×1.11 forever. This compounds without limit.</span>
          <button className="btn small gold" onClick={() => dispatch({ type: 'SIGN_CONTRACT' })}>Sign contract</button>
        </div>
      )}
    </div>
  )
}

import {
  START_CASH, IDLE_BUSINESSES, LEVEL_INCOME_GROWTH, LEVEL_COST_GROWTH, MAX_LEVEL,
  FLEET_BUSINESSES, SLOT_PACKS, CONSTRUCTION, DEALERSHIP, BANK, IT_COMPANY,
  FOOTBALL, OIL, STOCKS, CRYPTOS, PROPERTIES, RENT_RATE, IMPROVE_TIERS,
  IMPROVE_COST_PCT, IMPROVE_INCOME_BONUS, PROPERTY_SALES_TAX, LUXURY, LUXURY_RESALE,
  MERGERS, OFFLINE_CAP_HOURS, BUSINESS_SALES_TAX,
  MARKET_STEP_H, HIST_MAX, ACHIEVEMENTS,
  DEMAND_MIN, DEMAND_MAX, PRICE_MIN, PRICE_MAX,
  MANAGER_COST, MANAGER_SALARY_PCT, MARKETING_COST_PCT, MARKETING_HOURS, MARKETING_BOOST, MARKETING_COOLDOWN,
  ROUTES, FUEL_MIN, FUEL_MAX, FUEL_COST_SHARE, WORKSHOP_MAX, WORKSHOP_WEAR_CUT, WORKSHOP_BASE_COST,
  LEV_MIN, LEV_MAX, POSITION_MIN_MARGIN, POSITION_FEE,
  TOKEN_LAUNCH, TOKEN_POOL, INFLUENCERS, MAX_SLIPPAGE,
} from './data.js'

const rand = (a, b) => a + Math.random() * (b - a)

const clampBand = (p, min, max) => Math.min(max, Math.max(min, p))
const fmtLite = (n) => '$' + Math.round(n).toLocaleString()

// One market step for a stock: mean-reverting walk, 4 sub-steps → an OHLC candle
function stepStock(st, price) {
  const mid = (st.min + st.max) / 2
  let p = price
  const o = p; let hi = p, lo = p
  for (let k = 0; k < 4; k++) {
    p += (mid - p) * 0.015 + p * 0.016 * (Math.random() * 2 - 1)
    p = clampBand(p, st.min, st.max)
    if (p > hi) hi = p
    if (p < lo) lo = p
  }
  return { o, hi, lo, c: p }
}

// One market step for a crypto: momentum + noise + occasional pumps/dumps, per-coin personality
function stepCrypto(c, price, mom) {
  const mid = (c.min + c.max) / 2
  let m = mom * 0.9 + (Math.random() - 0.5) * (c.trend || 0) * 0.05
  let p = price
  const o = p; let hi = p, lo = p
  for (let k = 0; k < 4; k++) {
    p *= 1 + m / 4 + (c.vol / 2) * (Math.random() * 2 - 1)
    if (c.revert) p += (mid - p) * (c.revert / 4)
    if (Math.random() < (c.jumpChance || 0) / 4) {
      p *= 1 + (Math.random() < 0.5 ? -1 : 1) * c.jumpSize * (0.5 + Math.random() * 0.8)
    }
    p = clampBand(p, c.min, c.max)
    if (p > hi) hi = p
    if (p < lo) lo = p
  }
  // bounce momentum off the band edges so coins don't pin there
  if (p >= c.max * 0.99) m = -Math.abs(m) - 0.005
  if (p <= c.min * 1.01) m = Math.abs(m) + 0.005
  return { candle: { o, hi, lo, c: p }, mom: m }
}

// Pre-simulate a plausible candle history so charts aren't empty on first load
function seedHist(min, max, startH) {
  let p = rand(min, max)
  const hist = []
  const fake = { min, max }
  for (let i = 96; i > 0; i--) {
    const cd = stepStock(fake, p)
    p = cd.c
    hist.push({ h: startH - i * MARKET_STEP_H, ...cd })
  }
  return hist
}

// ---------- Liquidity: slippage + price impact ----------
// Trading against a book of `depth` dollars: a $X order slips X/(2·depth), capped.
// Buys pay more / receive fewer units; sells receive less. The trade also SHOVES
// the market price (half the slippage, lasting) — big bags move thin markets.
export const tradeSlippage = (usd, depth) =>
  Math.min(MAX_SLIPPAGE, Math.max(0, usd) / (2 * Math.max(1, depth || 1)))

function shovePrice(price, usd, depth, dir, min, max) {
  const impact = Math.min(0.12, (Math.max(0, usd) / Math.max(1, depth || 1)) * 0.35)
  return clampBand(price * (1 + dir * impact), min, max)
}

// ---------- Leverage positions ----------
export const positionQty = (margin, lev, entry) => (margin * lev) / entry
export const positionPnl = (pos, price) => pos.dir * (price - pos.entry) * pos.qty
export const liqPrice = (pos) => pos.dir === 1
  ? pos.entry * (1 - 1 / pos.lev)
  : pos.entry * (1 + 1 / pos.lev)
export function positionEquity(pos, price) {
  return Math.max(0, pos.margin + positionPnl(pos, price))
}

// ---------- Initial state ----------
export function initialState() {
  return {
    cash: START_CASH,
    lifetimeBusiness: 0,   // lifetime earnings from businesses only
    gameHours: 0,
    lastTs: Date.now(),
    idle: {},              // id -> { level, invested }
    fleets: {},            // id -> { slots, invested, vehicles: [{typeId, milesLeft}] }
    construction: null,    // { invested, workers, lifetime, project: {id, remainH} | null, ready: payout|0 }
    dealership: null,      // { invested, car: {brand, cost, repairLeftH, repaired} | null }
    bank: null,            // { invested, depositRate, creditRate, deposits, loans, vault }
    it: null,              // { invested, devs, project: {id, remainH} | null }
    football: null,        // { invested, players, sponsorLeftH }
    oil: null,             // { invested, income, contracts, contractLeftH }
    stocks: Object.fromEntries(STOCKS.map(s => {
      const hist = seedHist(s.min, s.max, 0)
      return [s.id, { price: hist[hist.length - 1].c, owned: 0, spent: 0, hist }]
    })),
    cryptos: Object.fromEntries(CRYPTOS.map(c => {
      const hist = seedHist(c.min, c.max, 0)
      return [c.id, { price: hist[hist.length - 1].c, owned: 0, spent: 0, hist, mom: 0 }]
    })),
    positions: [],         // leverage positions: { id, market, assetId, dir, lev, margin, entry, qty }
    posId: 1,
    orders: [],            // resting limit orders: { id, market, assetId, side, price, usd, createdH }
    orderId: 1,
    tokens: [],            // live launched tokens (see launchToken)
    nextTokenH: rand(TOKEN_LAUNCH.firstDelayH[0], TOKEN_LAUNCH.firstDelayH[1]),
    notifications: [],     // { id, t, icon, msg, target: {market, assetId} | null, read }
    notifId: 1,
    fin: { realized: 0, fees: 0, dividends: 0, rent: 0, liqLost: 0 }, // lifetime money trail
    marketAccH: 0,
    economy: {
      demand: Object.fromEntries(IDLE_BUSINESSES.map(b => [b.id, rand(0.8, 1.2)])),
      fuelPrice: 1,
    },
    properties: {},        // id -> { tier }
    luxury: {},            // id -> count
    mergers: {},           // id -> true
    achievements: {},      // id -> true
    log: [],
  }
}

// ---------- Derived values ----------
export const idleIncome = (biz, level) => biz.baseIncome * Math.pow(LEVEL_INCOME_GROWTH, level - 1)
export const upgradeCost = (biz, level) => biz.upgradeBase * Math.pow(LEVEL_COST_GROWTH, level - 1)

// Consumer economy: revenue = idleIncome * priceFactor * customers
// customers = demand + 1 - priceFactor  (raise prices → lose customers)
export function effectiveDemand(s, bizId) {
  const o = s.idle[bizId]
  const base = s.economy?.demand?.[bizId] ?? 1
  return base + (o && o.marketingLeftH > 0 ? MARKETING_BOOST : 0)
}
export function optimalPrice(demand) {
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(((demand + 1) / 2) * 100)))
}
export function idleRevenue(biz, o, demand) {
  const pricePct = o.manager ? optimalPrice(demand) : (o.price ?? 100)
  const pf = pricePct / 100
  const customers = Math.max(0.1, demand + 1 - pf)
  let rev = idleIncome(biz, o.level) * pf * customers
  if (o.manager) rev *= (1 - MANAGER_SALARY_PCT)
  return rev
}

// Fleet economics: route multiplies income and wear; fuel eats a share of gross
export function fleetVehicleNet(t, route, fuelPrice) {
  const gross = t.income * route.income
  const fuel = t.income * FUEL_COST_SHARE * route.fuel * fuelPrice
  return { gross, fuel, net: gross - fuel }
}
export function fleetWearPerHour(t, route, workshop) {
  return t.usePerHour * route.wear * (1 - Math.min(WORKSHOP_MAX, workshop || 0) * WORKSHOP_WEAR_CUT)
}
export const workshopCost = (level) => WORKSHOP_BASE_COST * Math.pow(2, level)
export const getRoute = (f) => ROUTES.find(r => r.id === (f.route || 'city')) || ROUTES[0]

export function propertyRent(p, tier) {
  return p.cost * RENT_RATE * (1 + tier * IMPROVE_INCOME_BONUS)
}

export function bankFlows(b) {
  if (!b) return { profit: 0, deposits: 0, loans: 0 }
  const spread = b.creditRate - b.depositRate
  const trust = spread > BANK.trustSpread ? 0.2 : 1
  const deposits = BANK.depositPull * b.depositRate * trust
  const demand = Math.max(0, BANK.loanDemand * (1 - b.creditRate / BANK.maxRate))
  const loans = Math.min(deposits, demand)
  const profit = loans * (b.creditRate / 100) - deposits * (b.depositRate / 100)
  return { profit, deposits, loans }
}

export function footballRating(f) {
  return f ? FOOTBALL.baseRating + f.players * FOOTBALL.ratingPerPlayer : 0
}

export function playerCost(f) {
  return FOOTBALL.playerCost * Math.pow(FOOTBALL.playerCostGrowth, f ? f.players : 0)
}

// income per hour from every business, split per source (for UI + tick)
export function businessIncomes(s) {
  const out = {}
  for (const biz of IDLE_BUSINESSES) {
    const o = s.idle[biz.id]
    if (o) out[biz.id] = idleRevenue(biz, o, effectiveDemand(s, biz.id))
  }
  for (const fb of FLEET_BUSINESSES) {
    const f = s.fleets[fb.id]
    if (!f) continue
    const route = getRoute(f)
    const fuelPrice = s.economy?.fuelPrice ?? 1
    out[fb.id] = f.vehicles.reduce((sum, v) => {
      const t = fb.vehicles.find(t => t.id === v.typeId)
      return sum + (v.milesLeft > 0 ? fleetVehicleNet(t, route, fuelPrice).net : 0)
    }, 0)
  }
  if (s.bank) out.bank = Math.max(0, bankFlows(s.bank).profit) // vault handles the raw number
  if (s.it) out.it = -s.it.devs * IT_COMPANY.devSalary
  if (s.football) {
    const mult = s.football.sponsorLeftH > 0 ? FOOTBALL.sponsorMult : 1
    out.football = footballRating(s.football) * FOOTBALL.incomePerRating * mult
  }
  if (s.oil) out.oil = s.oil.income
  for (const m of MERGERS) if (s.mergers[m.id]) out[m.id] = m.income
  return out
}

export function investmentIncomes(s) {
  let dividends = 0, buyouts = 0, rent = 0
  for (const st of STOCKS) {
    const h = s.stocks[st.id]
    if (h.owned > 0 && st.dividend > 0) dividends += h.owned * h.price * (st.dividend / 100)
    if (h.owned >= st.shares) buyouts += st.profit
  }
  for (const p of PROPERTIES) {
    const o = s.properties[p.id]
    if (o) rent += propertyRent(p, o.tier)
  }
  return { dividends, buyouts, rent }
}

export function netWorth(s) {
  let nw = s.cash
  for (const [id, o] of Object.entries(s.idle)) nw += o.invested * (1 - BUSINESS_SALES_TAX)
  for (const [, f] of Object.entries(s.fleets)) nw += f.invested * (1 - BUSINESS_SALES_TAX)
  for (const key of ['construction', 'dealership', 'bank', 'it', 'football', 'oil'])
    if (s[key]) nw += s[key].invested * (1 - BUSINESS_SALES_TAX)
  if (s.bank) nw += s.bank.vault
  for (const st of STOCKS) nw += s.stocks[st.id].owned * s.stocks[st.id].price
  for (const c of CRYPTOS) nw += s.cryptos[c.id].owned * s.cryptos[c.id].price
  for (const t of s.tokens || []) nw += t.owned * t.price
  for (const pos of s.positions || []) {
    const asset = getAsset(s, pos.market, pos.assetId)
    nw += positionEquity(pos, asset?.price ?? pos.entry)
  }
  for (const p of PROPERTIES) if (s.properties[p.id]) {
    nw += p.cost * (1 + s.properties[p.id].tier * IMPROVE_COST_PCT) * (1 - PROPERTY_SALES_TAX)
  }
  for (const l of LUXURY) {
    const n = s.luxury[l.id] || 0
    nw += n * l.cost * (l.cat === 'NFT' ? 1 : LUXURY_RESALE)
  }
  return nw
}

export function mergerEligible(s, id) {
  if (s.mergers[id]) return false
  if (id === 'clothing') {
    const chain = s.idle.shopChain, fac = s.idle.smallFactory, ship = s.fleets.shipping
    const vans = ship ? ship.vehicles.filter(v => v.typeId === 'cityvan' && v.milesLeft > 0).length : 0
    const trucks = ship ? ship.vehicles.filter(v => v.typeId === 'longhaul' && v.milesLeft > 0).length : 0
    return !!(chain && chain.level >= 10 && fac && fac.level >= 20 && vans >= 8 && trucks >= 2)
  }
  if (id === 'space') {
    const lf = s.idle.largeFactory, ship = s.fleets.shipping
    const vans = ship ? ship.vehicles.filter(v => v.typeId === 'cityvan' && v.milesLeft > 0).length : 0
    const trucks = ship ? ship.vehicles.filter(v => v.typeId === 'longhaul' && v.milesLeft > 0).length : 0
    return !!(lf && lf.level >= 25 && vans >= 50 && trucks >= 20 && s.construction && s.construction.lifetime >= 6000000)
  }
  if (id === 'holding') {
    let portfolio = 0
    for (const st of STOCKS) portfolio += s.stocks[st.id].owned * s.stocks[st.id].price
    return !!(s.bank && s.bank.vault >= 420000000 && portfolio >= 40000000)
  }
  return false
}

function checkAchievements(s) {
  const nw = netWorth(s)
  let ach = s.achievements
  for (const a of ACHIEVEMENTS) {
    if (!ach[a.id] && nw >= a.threshold) {
      ach = { ...ach, [a.id]: true }
      s.log = pushLog(s, `${a.icon} Achievement unlocked: ${a.name}`)
    }
  }
  return ach
}

function pushLog(s, msg) {
  return [{ t: Date.now(), msg }, ...s.log].slice(0, 40)
}

function pushNotif(next, icon, msg, target = null) {
  next.notifications = [
    { id: next.notifId, t: Date.now(), icon, msg, target, read: false },
    ...(next.notifications || []),
  ].slice(0, 30)
  next.notifId = (next.notifId || 1) + 1
}

// asset lookup across all three markets — positions and UI navigation use this
export function getAsset(s, market, assetId) {
  if (market === 'stock') return s.stocks[assetId]
  if (market === 'crypto') return s.cryptos[assetId]
  return (s.tokens || []).find(t => t.id === assetId)
}

// ---------- token launches ----------
function launchToken(next) {
  const used = new Set((next.tokens || []).map(t => t.sym))
  const pool = TOKEN_POOL.filter(p => !used.has(p.sym))
  if (!pool.length) return
  const pick = pool[Math.floor(Math.random() * pool.length)]
  const price = rand(TOKEN_LAUNCH.launchPriceRange[0], TOKEN_LAUNCH.launchPriceRange[1])
  const token = {
    id: 'TK_' + pick.sym, sym: pick.sym, name: pick.name,
    launchH: next.gameHours,
    price, min: price * 0.005, max: price * 150,
    phase: 'stealth', // stealth -> promoted -> dead (rug) | mooned (jackpot)
    fate: Math.random() < TOKEN_LAUNCH.rugChance ? 'rug' : 'jackpot',
    promoteAtH: next.gameHours + rand(TOKEN_LAUNCH.promoteDelayH[0], TOKEN_LAUNCH.promoteDelayH[1]),
    fateAtH: null, // set when promoted
    owned: 0, spent: 0, mom: 0.01,
    supply: Math.round(rand(5e7, 5e8)),
    depth: Math.round(rand(15000, 60000)), // paper-thin liquidity — exiting big bags hurts
    risk: 'degen',
    hist: [{ h: next.gameHours, o: price, hi: price, lo: price, c: price }],
  }
  next.tokens = [...(next.tokens || []), token]
  pushNotif(next, '🚀', `New token launched: $${token.sym} (${token.name}) at ${token.price < 1 ? '$' + token.price.toFixed(4) : '$' + token.price.toFixed(2)}. Unaudited. Do your own research.`, { market: 'token', assetId: token.id })
  next.log = pushLog(next, `🚀 $${token.sym} launched`)
}

// per-phase random-walk personality for launched tokens
function tokenStepParams(t) {
  if (t.phase === 'promoted') return { vol: 0.12, momPush: 0.10, jumpChance: 0.10, jumpSize: 0.30 }
  if (t.phase === 'mooned') return { vol: 0.05, momPush: 0, jumpChance: 0.03, jumpSize: 0.20 }
  if (t.phase === 'dead') return { vol: 0.02, momPush: -0.06, jumpChance: 0, jumpSize: 0 }
  return { vol: 0.08, momPush: 0.012, jumpChance: 0.06, jumpSize: 0.25 } // stealth: gentle up-drift
}

// ---------- Tick ----------
function tick(s, dtH) {
  const next = { ...s, gameHours: s.gameHours + dtH }
  let cash = s.cash
  let lifetime = s.lifetimeBusiness
  const fin = { realized: 0, fees: 0, dividends: 0, rent: 0, liqLost: 0, ...(s.fin || {}) }
  next.fin = fin

  // idle businesses: revenue depends on demand + your price; marketing timers tick down
  const idle = { ...next.idle }
  for (const biz of IDLE_BUSINESSES) {
    const o = idle[biz.id]
    if (!o) continue
    const inc = idleRevenue(biz, o, effectiveDemand(next, biz.id)) * dtH
    cash += inc; lifetime += inc
    if (o.marketingLeftH > 0 || o.marketingCdH > 0) {
      idle[biz.id] = {
        ...o,
        marketingLeftH: Math.max(0, (o.marketingLeftH || 0) - dtH),
        marketingCdH: Math.max(0, (o.marketingCdH || 0) - dtH),
      }
    }
  }
  next.idle = idle
  // fleets: route-scaled income minus fuel, route-scaled mileage burn
  const fleets = {}
  for (const fb of FLEET_BUSINESSES) {
    const f = next.fleets[fb.id]
    if (!f) continue
    const route = getRoute(f)
    const fuelPrice = next.economy?.fuelPrice ?? 1
    let inc = 0
    const vehicles = f.vehicles.map(v => {
      const t = fb.vehicles.find(t => t.id === v.typeId)
      if (v.milesLeft <= 0) return v
      const wear = fleetWearPerHour(t, route, f.workshop)
      const hours = Math.min(dtH, v.milesLeft / wear)
      inc += fleetVehicleNet(t, route, fuelPrice).net * hours
      return { ...v, milesLeft: Math.max(0, v.milesLeft - wear * dtH) }
    }).filter(v => v.milesLeft > 0)
    cash += inc; lifetime += inc
    fleets[fb.id] = { ...f, vehicles }
  }
  next.fleets = fleets

  // construction project timer
  if (next.construction && next.construction.project) {
    const p = { ...next.construction.project, remainH: next.construction.project.remainH - dtH }
    if (p.remainH <= 0) {
      const proj = CONSTRUCTION.projects.find(x => x.id === p.id)
      const skill = Math.min(CONSTRUCTION.skillCap, (next.construction.completed || 0) * CONSTRUCTION.skillPerProject)
      const payout = Math.round(proj.payout * (1 + skill))
      next.construction = {
        ...next.construction, project: null,
        ready: (next.construction.ready || 0) + payout,
        completed: (next.construction.completed || 0) + 1,
      }
      next.log = pushLog(next, `🏗️ ${proj.name} finished — collect $${payout.toLocaleString()}`)
    } else {
      next.construction = { ...next.construction, project: p }
    }
  }

  // dealership repair timer
  if (next.dealership && next.dealership.car && !next.dealership.car.repaired) {
    const car = { ...next.dealership.car, repairLeftH: next.dealership.car.repairLeftH - dtH }
    if (car.repairLeftH <= 0) { car.repaired = true; next.log = pushLog(next, `🔧 ${car.brand} repaired — ready to sell`) }
    next.dealership = { ...next.dealership, car }
  }

  // bank: profit accrues to the vault (collect manually)
  if (next.bank) {
    const { profit, deposits, loans } = bankFlows(next.bank)
    next.bank = { ...next.bank, deposits, loans, vault: Math.max(0, next.bank.vault + profit * dtH) }
  }

  // IT: salaries always drain (but can't take cash below zero); project pays on completion
  if (next.it) {
    cash = Math.max(0, cash - next.it.devs * IT_COMPANY.devSalary * dtH)
    if (next.it.project) {
      const p = { ...next.it.project, remainH: next.it.project.remainH - dtH }
      if (p.remainH <= 0) {
        const proj = IT_COMPANY.projects.find(x => x.id === p.id)
        const payout = Math.round(proj.payout * (1 + (next.it.seniority || 0) * IT_COMPANY.trainBonus))
        cash += payout; lifetime += payout
        next.it = { ...next.it, project: null }
        next.log = pushLog(next, `💻 ${proj.name} shipped — $${payout.toLocaleString()}`)
      } else next.it = { ...next.it, project: p }
    }
  }

  // football
  if (next.football) {
    const mult = next.football.sponsorLeftH > 0 ? FOOTBALL.sponsorMult : 1
    const inc = footballRating(next.football) * FOOTBALL.incomePerRating * mult * dtH
    cash += inc; lifetime += inc
    next.football = { ...next.football, sponsorLeftH: Math.max(0, next.football.sponsorLeftH - dtH) }
  }

  // oil: income + contract completion
  if (next.oil) {
    const inc = next.oil.income * dtH
    cash += inc; lifetime += inc
    if (next.oil.contractLeftH > 0) {
      const left = next.oil.contractLeftH - dtH
      if (left <= 0) {
        next.oil = {
          ...next.oil, contractLeftH: 0, contracts: next.oil.contracts + 1,
          income: next.oil.income * OIL.contractIncomeMult,
        }
        next.log = pushLog(next, `🛢️ Supply contract completed — income +11%`)
      } else next.oil = { ...next.oil, contractLeftH: left }
    }
  }

  // mergers pay
  for (const m of MERGERS) if (next.mergers[m.id]) { const inc = m.income * dtH; cash += inc; lifetime += inc }

  // investments: dividends + buyout profits + rent
  const { dividends, buyouts, rent } = investmentIncomes(next)
  cash += (dividends + buyouts + rent) * dtH
  fin.dividends += (dividends + buyouts) * dtH
  fin.rent += rent * dtH

  // market prices: move once per MARKET_STEP_H (every 5 real seconds), keeping history
  let acc = (next.marketAccH || 0) + dtH
  const steps = Math.min(HIST_MAX, Math.floor(acc / MARKET_STEP_H))
  acc -= Math.floor(acc / MARKET_STEP_H) * MARKET_STEP_H
  next.marketAccH = acc
  if (steps > 0) {
    // consumer demand + fuel price drift with the market
    const demand = { ...next.economy.demand }
    for (const biz of IDLE_BUSINESSES) {
      let d = demand[biz.id] ?? 1
      for (let i = 0; i < steps; i++) {
        d += (1 - d) * 0.03 + 0.05 * (Math.random() * 2 - 1)
        d = Math.min(DEMAND_MAX, Math.max(DEMAND_MIN, d))
      }
      demand[biz.id] = d
    }
    let fuel = next.economy.fuelPrice ?? 1
    for (let i = 0; i < steps; i++) {
      fuel += (1 - fuel) * 0.03 + 0.04 * (Math.random() * 2 - 1)
      fuel = Math.min(FUEL_MAX, Math.max(FUEL_MIN, fuel))
    }
    next.economy = { demand, fuelPrice: fuel }
    const newCandles = {} // 'stock:PEAR' -> [candles], for liquidation checks against wicks
    const stocks = { ...next.stocks }
    for (const st of STOCKS) {
      const cur = stocks[st.id]
      let p = cur.price
      const hist = cur.hist ? cur.hist.slice() : []
      const mine = []
      for (let i = 0; i < steps; i++) {
        const cd = stepStock(st, p)
        p = cd.c
        const entry = { h: next.gameHours - (steps - 1 - i) * MARKET_STEP_H, ...cd }
        hist.push(entry); mine.push(entry)
      }
      newCandles['stock:' + st.id] = mine
      stocks[st.id] = { ...cur, price: p, hist: hist.slice(-HIST_MAX) }
    }
    next.stocks = stocks
    const cryptos = { ...next.cryptos }
    for (const c of CRYPTOS) {
      const cur = cryptos[c.id]
      let p = cur.price
      let mom = cur.mom || 0
      const hist = cur.hist ? cur.hist.slice() : []
      const mine = []
      for (let i = 0; i < steps; i++) {
        const r = stepCrypto(c, p, mom)
        p = r.candle.c; mom = r.mom
        const entry = { h: next.gameHours - (steps - 1 - i) * MARKET_STEP_H, ...r.candle }
        hist.push(entry); mine.push(entry)
      }
      newCandles['crypto:' + c.id] = mine
      cryptos[c.id] = { ...cur, price: p, mom, hist: hist.slice(-HIST_MAX) }
    }
    next.cryptos = cryptos

    // launched tokens: lifecycle transitions + price steps
    if (next.gameHours >= (next.nextTokenH ?? Infinity) ) {
      if ((next.tokens || []).filter(t => t.phase !== 'dead').length < TOKEN_LAUNCH.maxActive) launchToken(next)
      next.nextTokenH = next.gameHours + rand(TOKEN_LAUNCH.nextDelayH[0], TOKEN_LAUNCH.nextDelayH[1])
    }
    if (next.tokens && next.tokens.length) {
      const tokens = []
      for (let t of next.tokens) {
        t = { ...t }
        // influencer shill moment
        if (t.phase === 'stealth' && next.gameHours >= t.promoteAtH) {
          t.phase = 'promoted'
          t.fateAtH = next.gameHours + rand(TOKEN_LAUNCH.fateDelayH[0], TOKEN_LAUNCH.fateDelayH[1])
          const who = INFLUENCERS[Math.floor(Math.random() * INFLUENCERS.length)]
          pushNotif(next, '📢', `${who} is shilling $${t.sym}! "This is the next 100x, trust me." Volume exploding.`, { market: 'token', assetId: t.id })
          next.log = pushLog(next, `📢 $${t.sym} is trending`)
        }
        // fate resolves
        if (t.phase === 'promoted' && next.gameHours >= t.fateAtH) {
          if (t.fate === 'rug') {
            t.phase = 'dead'
            t.deadAtH = next.gameHours
            t.price = Math.max(t.min, t.price * 0.03)
            t.depth = 1500 // pool drained — you can barely exit
            t.mom = 0
            pushNotif(next, '💀', `$${t.sym} RUGGED. Devs drained the pool and vanished. Price -97%.`, { market: 'token', assetId: t.id })
            next.log = pushLog(next, `💀 $${t.sym} rugged`)
          } else {
            t.phase = 'mooned'
            t.price = Math.min(t.max * 0.6, t.price * (4 + Math.random() * 6))
            t.min = t.price * 0.2
            t.max = t.price * 3
            t.depth = t.depth * 10 // exchange listing brings real liquidity
            t.mom = 0
            pushNotif(next, '💎', `$${t.sym} MOONED. Exchange listing confirmed — up ${Math.round(400 + Math.random() * 600)}% and holding.`, { market: 'token', assetId: t.id })
            next.log = pushLog(next, `💎 $${t.sym} mooned`)
          }
        }
        if (t.phase === 'dead') {
          // rugged: chart is frozen — the pool is gone, price does not move
          newCandles['token:' + t.id] = []
          // delist quickly; auto-settle any dust the player still holds into cash
          const hasPos = (next.positions || []).some(x => x.market === 'token' && x.assetId === t.id)
          const delistDue = next.gameHours > (t.deadAtH || 0) + TOKEN_LAUNCH.delistAfterH
          if (delistDue && !hasPos) {
            if (t.owned > 0) {
              const dust = t.owned * t.price
              cash += dust
              fin.realized += dust - t.spent
              next.log = pushLog(next, `🪦 $${t.sym} delisted — ${dust >= 1 ? 'settled ' + fmtLite(dust) : 'holdings worthless'}`)
            } else {
              next.log = pushLog(next, `🪦 $${t.sym} delisted`)
            }
            // token dropped (not pushed to survivors)
          } else {
            tokens.push(t)
          }
        } else {
          // price steps for living tokens
          const prm = tokenStepParams(t)
          let p = t.price
          let mom = t.mom || 0
          const hist = t.hist.slice()
          const mine = []
          for (let i = 0; i < steps; i++) {
            mom = mom * 0.9 + prm.momPush * 0.1 + (Math.random() - 0.5) * 0.02
            const o = p; let hi = p, lo = p
            for (let k = 0; k < 4; k++) {
              p *= 1 + mom / 4 + (prm.vol / 2) * (Math.random() * 2 - 1)
              if (Math.random() < prm.jumpChance / 4) p *= 1 + (Math.random() < 0.5 ? -1 : 1) * prm.jumpSize * (0.5 + Math.random() * 0.8)
              if (t.phase === 'mooned') p += ((t.min + t.max) / 2 - p) * 0.005
              p = clampBand(p, t.min, t.max)
              if (p > hi) hi = p
              if (p < lo) lo = p
            }
            const entry = { h: next.gameHours - (steps - 1 - i) * MARKET_STEP_H, o, hi, lo, c: p }
            hist.push(entry); mine.push(entry)
          }
          newCandles['token:' + t.id] = mine
          t.price = p; t.mom = mom; t.hist = hist.slice(-HIST_MAX)
          tokens.push(t)
        }
      }
      next.tokens = tokens
    }

    // resting limit orders fill when a step candle's range reaches the trigger price
    if (next.orders && next.orders.length) {
      const remain = []
      for (const ord of next.orders) {
        const candles = newCandles[ord.market + ':' + ord.assetId] || []
        const def = ord.market === 'stock' ? STOCKS.find(x => x.id === ord.assetId) : CRYPTOS.find(x => x.id === ord.assetId)
        const book = ord.market === 'stock' ? next.stocks : next.cryptos
        const h = def && book ? book[ord.assetId] : null
        if (!def || !h) continue // stale order — drop silently
        let hit = false
        for (const cd of candles) {
          if (ord.side === 'buy' ? cd.lo <= ord.price : cd.hi >= ord.price) { hit = true; break }
        }
        if (!hit) { remain.push(ord); continue }
        // marketable limits fill at the market, never worse than the limit price
        const px = ord.side === 'buy' ? Math.min(ord.price, h.price) : Math.max(ord.price, h.price)
        if (ord.side === 'buy' && ord.market === 'stock') {
          const qty = Math.min(Math.floor(ord.usd / px), def.shares - h.owned)
          const spend = qty * px
          const cost = spend * (1 + tradeSlippage(spend, def.depth))
          if (qty > 0 && cash >= cost) {
            cash -= cost; fin.fees += cost - spend
            book[ord.assetId] = { ...h, owned: h.owned + qty, spent: h.spent + cost }
            next.log = pushLog(next, `✅ Limit buy filled: ${qty} ${ord.assetId} @ ${fmtLite(px)}`)
          } else next.log = pushLog(next, `✖ Limit buy ${ord.assetId} cancelled — can't afford at fill`)
        } else if (ord.side === 'buy') {
          const usd = ord.usd
          if (cash >= usd) {
            const qty = (usd * (1 - tradeSlippage(usd, def.depth))) / px
            cash -= usd; fin.fees += usd - qty * px
            book[ord.assetId] = { ...h, owned: h.owned + qty, spent: h.spent + usd }
            next.log = pushLog(next, `✅ Limit buy filled: ${fmtLite(usd)} of ${ord.assetId} @ ${fmtLite(px)}`)
          } else next.log = pushLog(next, `✖ Limit buy ${ord.assetId} cancelled — can't afford at fill`)
        } else if (h.owned > 0) { // sell all holdings at the limit price
          const usd = h.owned * px
          const proceeds = usd * (1 - tradeSlippage(usd, def.depth))
          cash += proceeds; fin.realized += proceeds - h.spent; fin.fees += usd - proceeds
          book[ord.assetId] = { ...h, owned: 0, spent: 0 }
          next.log = pushLog(next, `✅ Limit sell filled: ${ord.assetId} @ ${fmtLite(px)} → ${fmtLite(proceeds)}`)
        }
      }
      next.orders = remain
    }

    // liquidations: a position dies the moment a candle WICK crosses its liquidation price
    if (next.positions && next.positions.length) {
      const survivors = []
      for (const pos of next.positions) {
        const candles = newCandles[pos.market + ':' + pos.assetId] || []
        let dead = false
        for (const cd of candles) {
          const worst = pos.dir === 1 ? cd.lo : cd.hi
          if (positionPnl(pos, worst) <= -pos.margin) { dead = true; break }
        }
        if (dead) {
          fin.liqLost += pos.margin
          next.log = pushLog(next, `💥 LIQUIDATED: ${pos.dir === 1 ? 'long' : 'short'} ${pos.lev}× ${pos.assetId} — margin $${Math.round(pos.margin).toLocaleString()} gone`)
        } else survivors.push(pos)
      }
      next.positions = survivors
    }
  }

  next.cash = cash
  next.lifetimeBusiness = lifetime
  next.achievements = checkAchievements(next)
  return next
}

// ---------- Reducer ----------
const EMPTY_FIN = { realized: 0, fees: 0, dividends: 0, rent: 0, liqLost: 0 }
const addFin = (s, patch) => {
  const f = { ...EMPTY_FIN, ...(s.fin || {}) }
  for (const k in patch) f[k] = (f[k] || 0) + patch[k]
  return f
}
export function reducer(s, a) {
  const pay = (cost) => s.cash >= cost
  switch (a.type) {
    case 'TICK': return tick(s, a.dtH)
    case 'LOAD': return a.state

    case 'BUY_IDLE': {
      const biz = IDLE_BUSINESSES.find(b => b.id === a.id)
      if (s.idle[a.id] || !pay(biz.cost)) return s
      return { ...s, cash: s.cash - biz.cost, idle: { ...s.idle, [a.id]: { level: 1, invested: biz.cost, price: 100, manager: false, marketingLeftH: 0, marketingCdH: 0 } }, log: pushLog(s, `${biz.icon} Opened ${biz.name}`) }
    }
    case 'SET_PRICE': {
      const o = s.idle[a.id]
      if (!o || !Number.isFinite(a.price)) return s
      const price = Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(a.price)))
      return { ...s, idle: { ...s.idle, [a.id]: { ...o, price } } }
    }
    case 'HIRE_MANAGER': {
      const o = s.idle[a.id]
      if (!o || o.manager || !pay(MANAGER_COST)) return s
      return { ...s, cash: s.cash - MANAGER_COST, idle: { ...s.idle, [a.id]: { ...o, manager: true, invested: o.invested + MANAGER_COST } } }
    }
    case 'FIRE_MANAGER': {
      const o = s.idle[a.id]
      if (!o || !o.manager) return s
      return { ...s, idle: { ...s.idle, [a.id]: { ...o, manager: false } } }
    }
    case 'START_MARKETING': {
      const biz = IDLE_BUSINESSES.find(b => b.id === a.id)
      const o = s.idle[a.id]
      const cost = biz.baseIncome * MARKETING_COST_PCT * Math.pow(LEVEL_INCOME_GROWTH, o ? o.level - 1 : 0)
      if (!o || (o.marketingCdH || 0) > 0 || !pay(cost)) return s
      return {
        ...s, cash: s.cash - cost,
        idle: { ...s.idle, [a.id]: { ...o, marketingLeftH: MARKETING_HOURS, marketingCdH: MARKETING_COOLDOWN } },
        log: pushLog(s, `📣 Marketing campaign launched for ${biz.name}`),
      }
    }
    case 'UPGRADE_IDLE': {
      const biz = IDLE_BUSINESSES.find(b => b.id === a.id)
      const o = s.idle[a.id]
      if (!o || o.level >= MAX_LEVEL) return s
      const cost = upgradeCost(biz, o.level)
      if (!pay(cost)) return s
      return { ...s, cash: s.cash - cost, idle: { ...s.idle, [a.id]: { level: o.level + 1, invested: o.invested + cost } } }
    }
    case 'BUY_FLEET': {
      const fb = FLEET_BUSINESSES.find(f => f.id === a.id)
      if (s.fleets[a.id] || !pay(fb.cost)) return s
      return { ...s, cash: s.cash - fb.cost, fleets: { ...s.fleets, [a.id]: { slots: fb.startSlots, invested: fb.cost, vehicles: [], route: 'city', workshop: 0 } }, log: pushLog(s, `${fb.icon} Founded ${fb.name}`) }
    }
    case 'SET_ROUTE': {
      const f = s.fleets[a.id]
      if (!f || !ROUTES.some(r => r.id === a.route)) return s
      return { ...s, fleets: { ...s.fleets, [a.id]: { ...f, route: a.route } } }
    }
    case 'UPGRADE_WORKSHOP': {
      const f = s.fleets[a.id]
      if (!f || (f.workshop || 0) >= WORKSHOP_MAX) return s
      const cost = workshopCost(f.workshop || 0)
      if (!pay(cost)) return s
      return { ...s, cash: s.cash - cost, fleets: { ...s.fleets, [a.id]: { ...f, workshop: (f.workshop || 0) + 1, invested: f.invested + cost } } }
    }
    case 'BUY_VEHICLE': {
      const fb = FLEET_BUSINESSES.find(f => f.id === a.id)
      const f = s.fleets[a.id]
      const t = fb.vehicles.find(v => v.id === a.vehicleId)
      if (!f || f.vehicles.length >= f.slots || !pay(t.cost)) return s
      return {
        ...s, cash: s.cash - t.cost,
        fleets: { ...s.fleets, [a.id]: { ...f, invested: f.invested + t.cost, vehicles: [...f.vehicles, { typeId: t.id, milesLeft: t.miles }] } },
      }
    }
    case 'EXPAND_SLOTS': {
      const f = s.fleets[a.id]
      const pack = SLOT_PACKS[a.pack]
      if (!f || !pay(pack.cost)) return s
      return { ...s, cash: s.cash - pack.cost, fleets: { ...s.fleets, [a.id]: { ...f, invested: f.invested + pack.cost, slots: f.slots + pack.count } } }
    }

    case 'BUY_CONSTRUCTION':
      if (s.construction || !pay(CONSTRUCTION.cost)) return s
      return { ...s, cash: s.cash - CONSTRUCTION.cost, construction: { invested: CONSTRUCTION.cost, workers: 0, lifetime: 0, project: null, ready: 0, completed: 0 }, log: pushLog(s, '👷 Founded Construction Company') }
    case 'HIRE_WORKER': {
      if (!s.construction || !pay(CONSTRUCTION.workerCost)) return s
      return { ...s, cash: s.cash - CONSTRUCTION.workerCost, construction: { ...s.construction, invested: s.construction.invested + CONSTRUCTION.workerCost, workers: s.construction.workers + 1 } }
    }
    case 'START_PROJECT': {
      const proj = CONSTRUCTION.projects.find(p => p.id === a.id)
      const c = s.construction
      if (!c || c.project || c.workers < proj.workers || !pay(proj.materials)) return s
      return { ...s, cash: s.cash - proj.materials, construction: { ...c, project: { id: proj.id, remainH: proj.hours } } }
    }
    case 'COLLECT_PROJECT': {
      const c = s.construction
      if (!c || !c.ready) return s
      return { ...s, cash: s.cash + c.ready, lifetimeBusiness: s.lifetimeBusiness + c.ready, construction: { ...c, ready: 0, lifetime: c.lifetime + c.ready } }
    }

    case 'BUY_DEALERSHIP':
      if (s.dealership || !pay(DEALERSHIP.cost)) return s
      return { ...s, cash: s.cash - DEALERSHIP.cost, dealership: { invested: DEALERSHIP.cost, car: null }, log: pushLog(s, '🚗 Opened Car Dealership') }
    case 'BUY_USED_CAR': {
      const d = s.dealership
      if (!d || d.car) return s
      const cost = Math.round(rand(DEALERSHIP.minCar, DEALERSHIP.maxCar))
      const repair = Math.round(cost * DEALERSHIP.repairCostPct)
      if (!pay(cost + repair)) return s
      const brand = DEALERSHIP.carBrands[Math.floor(Math.random() * DEALERSHIP.carBrands.length)]
      return { ...s, cash: s.cash - cost - repair, dealership: { ...d, car: { brand, cost, repairLeftH: DEALERSHIP.repairHours, repaired: false } } }
    }
    case 'SELL_CAR': {
      const d = s.dealership
      if (!d || !d.car || !d.car.repaired) return s
      const sale = Math.round(d.car.cost * DEALERSHIP.saleMultiplier)
      return { ...s, cash: s.cash + sale, lifetimeBusiness: s.lifetimeBusiness + sale, dealership: { ...d, car: null }, log: pushLog(s, `🚗 Sold ${d.car.brand} for $${sale.toLocaleString()}`) }
    }

    case 'BUY_BANK':
      if (s.bank || !pay(BANK.cost)) return s
      return { ...s, cash: s.cash - BANK.cost, bank: { invested: BANK.cost, depositRate: 2, creditRate: 5, deposits: 0, loans: 0, vault: 0 }, log: pushLog(s, '🏦 Opened Bank') }
    case 'SET_RATES': {
      if (!s.bank || !Number.isFinite(a.depositRate) || !Number.isFinite(a.creditRate)) return s
      const depositRate = Math.min(BANK.maxRate, Math.max(0, a.depositRate))
      const creditRate = Math.min(BANK.maxRate, Math.max(0, a.creditRate))
      return { ...s, bank: { ...s.bank, depositRate, creditRate } }
    }
    case 'COLLECT_VAULT': {
      if (!s.bank || s.bank.vault <= 0) return s
      const v = s.bank.vault
      return { ...s, cash: s.cash + v, lifetimeBusiness: s.lifetimeBusiness + v, bank: { ...s.bank, vault: 0 }, log: pushLog(s, `🏦 Collected $${Math.round(v).toLocaleString()} from the vault`) }
    }

    case 'BUY_IT':
      if (s.it || !pay(IT_COMPANY.cost)) return s
      return { ...s, cash: s.cash - IT_COMPANY.cost, it: { invested: IT_COMPANY.cost, devs: 0, project: null, seniority: 0 }, log: pushLog(s, '💻 Founded IT Company') }
    case 'TRAIN_DEVS': {
      if (!s.it || (s.it.seniority || 0) >= IT_COMPANY.trainMax) return s
      const cost = IT_COMPANY.trainBaseCost * Math.pow(IT_COMPANY.trainCostGrowth, s.it.seniority || 0)
      if (!pay(cost)) return s
      return { ...s, cash: s.cash - cost, it: { ...s.it, seniority: (s.it.seniority || 0) + 1, invested: s.it.invested + cost } }
    }
    case 'HIRE_DEV':
      if (!s.it) return s
      return { ...s, it: { ...s.it, devs: s.it.devs + 1 } }
    case 'FIRE_DEV':
      if (!s.it || s.it.devs <= 0) return s
      return { ...s, it: { ...s.it, devs: s.it.devs - 1 } }
    case 'START_IT_PROJECT': {
      const proj = IT_COMPANY.projects.find(p => p.id === a.id)
      if (!s.it || s.it.project || s.it.devs < proj.devs) return s
      return { ...s, it: { ...s.it, project: { id: proj.id, remainH: proj.hours } } }
    }
    case 'SELL_IT': {
      if (!s.it) return s
      const refund = s.it.invested * (1 - BUSINESS_SALES_TAX)
      return { ...s, cash: s.cash + refund, it: null, log: pushLog(s, '💻 Sold the IT Company') }
    }

    case 'BUY_FOOTBALL':
      if (s.football || !pay(FOOTBALL.cost)) return s
      return { ...s, cash: s.cash - FOOTBALL.cost, football: { invested: FOOTBALL.cost, players: 0, sponsorLeftH: 0 }, log: pushLog(s, '⚽ Bought Football Club') }
    case 'SIGN_PLAYER': {
      const f = s.football
      if (!f || f.players >= FOOTBALL.maxPlayers) return s
      const cost = playerCost(f)
      if (!pay(cost)) return s
      return { ...s, cash: s.cash - cost, football: { ...f, invested: f.invested + cost, players: f.players + 1 } }
    }
    case 'SIGN_SPONSOR': {
      const f = s.football
      if (!f || f.sponsorLeftH > 0 || !pay(FOOTBALL.sponsorCost)) return s
      return { ...s, cash: s.cash - FOOTBALL.sponsorCost, football: { ...f, sponsorLeftH: FOOTBALL.sponsorHours } }
    }

    case 'BUY_OIL':
      if (s.oil || !pay(OIL.cost)) return s
      return { ...s, cash: s.cash - OIL.cost, oil: { invested: OIL.cost, income: OIL.baseIncome, contracts: 0, contractLeftH: 0 }, log: pushLog(s, '🛢️ Acquired Oil & Gas Company') }
    case 'SIGN_CONTRACT':
      if (!s.oil || s.oil.contractLeftH > 0) return s
      return { ...s, oil: { ...s.oil, contractLeftH: OIL.contractHours } }

    case 'BUY_STOCK': {
      const st = STOCKS.find(x => x.id === a.id)
      const h = s.stocks[a.id]
      const qty = Math.min(a.qty, st.shares - h.owned)
      const usd = qty * h.price
      const cost = usd * (1 + tradeSlippage(usd, st.depth))
      if (qty <= 0 || !pay(cost)) return s
      const price = shovePrice(h.price, usd, st.depth, +1, st.min, st.max)
      return { ...s, cash: s.cash - cost, fin: addFin(s, { fees: cost - usd }), stocks: { ...s.stocks, [a.id]: { ...h, price, owned: h.owned + qty, spent: h.spent + cost } } }
    }
    case 'SELL_STOCK': {
      const st = STOCKS.find(x => x.id === a.id)
      const h = s.stocks[a.id]
      const qty = Math.min(a.qty, h.owned)
      if (qty <= 0) return s
      const usd = qty * h.price
      const proceeds = usd * (1 - tradeSlippage(usd, st.depth))
      const price = shovePrice(h.price, usd, st.depth, -1, st.min, st.max)
      const basis = h.spent * (qty / h.owned)
      return { ...s, cash: s.cash + proceeds, fin: addFin(s, { realized: proceeds - basis, fees: usd - proceeds }), stocks: { ...s.stocks, [a.id]: { ...h, price, owned: h.owned - qty, spent: Math.max(0, h.spent * (1 - qty / h.owned)) } } }
    }
    case 'OPEN_POSITION': {
      if (!['stock', 'crypto', 'token'].includes(a.market)) return s
      const asset = getAsset(s, a.market, a.assetId)
      if (!asset || !Number.isFinite(asset.price)) return s
      const lev = Math.round(a.lev)
      const margin = a.margin
      if (!Number.isFinite(margin) || margin < POSITION_MIN_MARGIN) return s
      if (lev < LEV_MIN || lev > LEV_MAX) return s
      if ((a.dir !== 1 && a.dir !== -1)) return s
      const fee = margin * lev * POSITION_FEE
      if (!pay(margin + fee)) return s
      const entry = asset.price
      const pos = { id: s.posId, market: a.market, assetId: a.assetId, dir: a.dir, lev, margin, entry, qty: positionQty(margin, lev, entry) }
      return {
        ...s, cash: s.cash - margin - fee, posId: s.posId + 1,
        fin: addFin(s, { fees: fee }),
        positions: [...(s.positions || []), pos],
        log: pushLog(s, `📊 Opened ${a.dir === 1 ? 'long' : 'short'} ${lev}× ${a.assetId} · margin $${Math.round(margin).toLocaleString()}`),
      }
    }
    case 'CLOSE_POSITION': {
      const pos = (s.positions || []).find(p => p.id === a.id)
      if (!pos) return s
      const price = getAsset(s, pos.market, pos.assetId)?.price ?? pos.entry
      const pnl = Math.max(-pos.margin, positionPnl(pos, price))
      return {
        ...s, cash: s.cash + pos.margin + pnl,
        fin: addFin(s, { realized: pnl }),
        positions: s.positions.filter(p => p.id !== a.id),
        log: pushLog(s, `📊 Closed ${pos.dir === 1 ? 'long' : 'short'} ${pos.lev}× ${pos.assetId} · ${pnl >= 0 ? '+' : ''}$${Math.round(pnl).toLocaleString()}`),
      }
    }
    case 'BUY_TOKEN': {
      const i = (s.tokens || []).findIndex(t => t.id === a.id)
      if (i < 0) return s
      const t = s.tokens[i]
      if (!Number.isFinite(a.usd) || a.usd <= 0 || !pay(a.usd) || t.phase === 'dead') return s
      const qty = (a.usd * (1 - tradeSlippage(a.usd, t.depth))) / t.price
      const price = shovePrice(t.price, a.usd, t.depth, +1, t.min, t.max)
      const tokens = s.tokens.slice()
      tokens[i] = { ...t, price, owned: t.owned + qty, spent: t.spent + a.usd }
      return { ...s, cash: s.cash - a.usd, fin: addFin(s, { fees: a.usd - qty * t.price }), tokens }
    }
    case 'SELL_TOKEN': {
      const i = (s.tokens || []).findIndex(t => t.id === a.id)
      if (i < 0) return s
      const t = s.tokens[i]
      if (t.owned <= 0) return s
      const usd = t.owned * t.price
      const proceeds = usd * (1 - tradeSlippage(usd, t.depth))
      const price = shovePrice(t.price, usd, t.depth, -1, t.min, t.max)
      const tokens = s.tokens.slice()
      tokens[i] = { ...t, price, owned: 0, spent: 0 }
      return { ...s, cash: s.cash + proceeds, fin: addFin(s, { realized: proceeds - t.spent, fees: usd - proceeds }), tokens }
    }
    case 'READ_NOTIF':
      return { ...s, notifications: (s.notifications || []).map(n => n.id === a.id ? { ...n, read: true } : n) }
    case 'READ_ALL_NOTIFS':
      return { ...s, notifications: (s.notifications || []).map(n => ({ ...n, read: true })) }
    case 'BUY_CRYPTO': {
      const c = CRYPTOS.find(x => x.id === a.id)
      const h = s.cryptos[a.id]
      if (!c || !Number.isFinite(a.usd) || a.usd <= 0 || !pay(a.usd)) return s
      const qty = (a.usd * (1 - tradeSlippage(a.usd, c.depth))) / h.price
      const price = shovePrice(h.price, a.usd, c.depth, +1, c.min, c.max)
      return { ...s, cash: s.cash - a.usd, fin: addFin(s, { fees: a.usd - qty * h.price }), cryptos: { ...s.cryptos, [a.id]: { ...h, price, owned: h.owned + qty, spent: h.spent + a.usd } } }
    }
    case 'SELL_CRYPTO': {
      const c = CRYPTOS.find(x => x.id === a.id)
      const h = s.cryptos[a.id]
      if (!c || h.owned <= 0) return s
      const frac = Math.min(1, Math.max(0, a.frac ?? 1)) // default: sell all (backward compatible)
      const sellQty = h.owned * frac
      if (sellQty <= 0) return s
      const usd = sellQty * h.price
      const proceeds = usd * (1 - tradeSlippage(usd, c.depth))
      const price = shovePrice(h.price, usd, c.depth, -1, c.min, c.max)
      const owned = h.owned - sellQty
      const basis = h.spent * frac
      return { ...s, cash: s.cash + proceeds, fin: addFin(s, { realized: proceeds - basis, fees: usd - proceeds }), cryptos: { ...s.cryptos, [a.id]: { ...h, price, owned: owned > 1e-9 ? owned : 0, spent: owned > 1e-9 ? h.spent - basis : 0 } } }
    }

    // resting limit orders: buy = usd-notional at price, sell = sell-all at price
    case 'PLACE_ORDER': {
      const { market, assetId, side, price, usd } = a
      if (!['stock', 'crypto'].includes(market)) return s
      const def = market === 'stock' ? STOCKS.find(x => x.id === assetId) : CRYPTOS.find(x => x.id === assetId)
      if (!def) return s
      if (side !== 'buy' && side !== 'sell') return s
      if (!Number.isFinite(price) || price <= 0) return s
      if (side === 'buy' && (!Number.isFinite(usd) || usd <= 0)) return s
      if ((s.orders || []).length >= 20) return s // cap open orders
      const ord = { id: s.orderId, market, assetId, side, price, usd: side === 'buy' ? usd : 0, createdH: s.gameHours }
      return { ...s, orderId: s.orderId + 1, orders: [...(s.orders || []), ord], log: pushLog(s, `⏳ Limit ${side} ${assetId} @ ${fmtLite(price)}`) }
    }
    case 'CANCEL_ORDER':
      return { ...s, orders: (s.orders || []).filter(o => o.id !== a.id) }

    case 'BUY_PROPERTY': {
      const p = PROPERTIES.find(x => x.id === a.id)
      if (s.properties[a.id] || !pay(p.cost)) return s
      return { ...s, cash: s.cash - p.cost, properties: { ...s.properties, [a.id]: { tier: 0 } }, log: pushLog(s, `${p.icon} Bought ${p.name}`) }
    }
    case 'IMPROVE_PROPERTY': {
      const p = PROPERTIES.find(x => x.id === a.id)
      const o = s.properties[a.id]
      if (!o || o.tier >= IMPROVE_TIERS) return s
      const cost = p.cost * IMPROVE_COST_PCT
      if (!pay(cost)) return s
      return { ...s, cash: s.cash - cost, properties: { ...s.properties, [a.id]: { tier: o.tier + 1 } } }
    }
    case 'SELL_PROPERTY': {
      const p = PROPERTIES.find(x => x.id === a.id)
      const o = s.properties[a.id]
      if (!o) return s
      const value = p.cost * (1 + o.tier * IMPROVE_COST_PCT) * (1 - PROPERTY_SALES_TAX)
      const props = { ...s.properties }; delete props[a.id]
      return { ...s, cash: s.cash + value, properties: props }
    }

    case 'BUY_LUXURY': {
      const l = LUXURY.find(x => x.id === a.id)
      if (!pay(l.cost)) return s
      return { ...s, cash: s.cash - l.cost, luxury: { ...s.luxury, [a.id]: (s.luxury[a.id] || 0) + 1 }, log: pushLog(s, `${l.icon} Bought ${l.name}`) }
    }
    case 'SELL_LUXURY': {
      const l = LUXURY.find(x => x.id === a.id)
      const n = s.luxury[a.id] || 0
      if (n <= 0) return s
      const value = l.cost * (l.cat === 'NFT' ? 1 : LUXURY_RESALE)
      return { ...s, cash: s.cash + value, luxury: { ...s.luxury, [a.id]: n - 1 } }
    }

    case 'MERGE': {
      const m = MERGERS.find(x => x.id === a.id)
      if (!mergerEligible(s, a.id) || !pay(m.capital)) return s
      return { ...s, cash: s.cash - m.capital, mergers: { ...s.mergers, [a.id]: true }, log: pushLog(s, `${m.icon} MERGER: ${m.name} founded! +$${m.income.toLocaleString()}/hr`) }
    }
    case 'RESET': return initialState()
    default: return s
  }
}

// ---------- Persistence ----------
const SAVE_KEY = 'empire-tycoon-save-v1'

export function save(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastTs: Date.now() })) } catch {}
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const base = initialState()
    const merged = { ...base, ...parsed, stocks: { ...base.stocks, ...parsed.stocks }, cryptos: { ...base.cryptos, ...parsed.cryptos } }
    // migrate saves: missing history is reseeded; old line-history points become flat candles
    const upgradeHist = (hist) => hist.map(d => d.c != null ? d : { h: d.h, o: d.p, hi: d.p, lo: d.p, c: d.p })
    for (const st of STOCKS) {
      const h = merged.stocks[st.id]
      if (!h.hist || !h.hist.length) merged.stocks[st.id] = { ...h, hist: seedHist(st.min, st.max, merged.gameHours || 0) }
      else merged.stocks[st.id] = { ...h, hist: upgradeHist(h.hist) }
    }
    for (const c of CRYPTOS) {
      const h = merged.cryptos[c.id]
      if (!h.hist || !h.hist.length) merged.cryptos[c.id] = { ...h, hist: seedHist(c.min, c.max, merged.gameHours || 0), mom: 0 }
      else merged.cryptos[c.id] = { mom: 0, ...h, hist: upgradeHist(h.hist) }
    }
    if (!Array.isArray(merged.positions)) merged.positions = []
    if (!merged.posId) merged.posId = 1
    if (!Array.isArray(merged.orders)) merged.orders = []
    if (!merged.orderId) merged.orderId = 1
    if (!Array.isArray(merged.tokens)) merged.tokens = []
    if (merged.nextTokenH == null) merged.nextTokenH = (merged.gameHours || 0) + rand(TOKEN_LAUNCH.firstDelayH[0], TOKEN_LAUNCH.firstDelayH[1])
    if (!Array.isArray(merged.notifications)) merged.notifications = []
    if (!merged.notifId) merged.notifId = 1
    merged.fin = { realized: 0, fees: 0, dividends: 0, rent: 0, liqLost: 0, ...(merged.fin || {}) }
    // migrate saves from before the economy/achievements update
    if (!merged.economy || !merged.economy.demand) merged.economy = base.economy
    if (!merged.achievements) merged.achievements = {}
    delete merged.insignia; delete merged.monopolyCode
    for (const [id, o] of Object.entries(merged.idle)) {
      merged.idle[id] = { price: 100, manager: false, marketingLeftH: 0, marketingCdH: 0, ...o }
    }
    for (const [id, f] of Object.entries(merged.fleets)) {
      merged.fleets[id] = { route: 'city', workshop: 0, ...f }
    }
    if (merged.construction && merged.construction.completed == null) merged.construction.completed = 0
    if (merged.it && merged.it.seniority == null) merged.it.seniority = 0
    // offline progress
    const elapsedH = Math.min(OFFLINE_CAP_HOURS, ((Date.now() - (parsed.lastTs || Date.now())) / 1000) * 0.1)
    if (elapsedH > 0.05) {
      const before = merged.cash
      const after = tickPublic(merged, elapsedH)
      after.offlineEarned = after.cash - before
      after.offlineH = elapsedH // game-hours away (display only, for the offline modal)
      return after
    }
    return merged
  } catch { return null }
}

function tickPublic(s, dtH) { return reducer(s, { type: 'TICK', dtH }) }

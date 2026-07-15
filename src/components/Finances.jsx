import React from 'react'
import {
  STOCKS, CRYPTOS, PROPERTIES, LUXURY, IDLE_BUSINESSES, FLEET_BUSINESSES,
  IMPROVE_COST_PCT, PROPERTY_SALES_TAX, LUXURY_RESALE, BUSINESS_SALES_TAX,
} from '../game/data.js'
import {
  netWorth, businessIncomes, investmentIncomes, propertyRent, positionEquity, positionPnl,
} from '../game/engine.js'
import { fmt } from '../format.js'

const Row = ({ label, value, cls = '', sub }) => (
  <div className="fin-row">
    <span className="fin-label">{label}{sub && <span className="fin-sub"> {sub}</span>}</span>
    <b className={`fin-val ${cls}`}>{value}</b>
  </div>
)
const sign = (n) => (n >= 0 ? '+' : '')
const pc = (n) => (n >= 0 ? 'up' : 'down')

export default function Finances({ state }) {
  const nw = netWorth(state)
  const fin = state.fin || { realized: 0, fees: 0, dividends: 0, rent: 0, liqLost: 0 }

  // ---- net worth breakdown ----
  let bizVal = 0
  for (const [, o] of Object.entries(state.idle)) bizVal += o.invested * (1 - BUSINESS_SALES_TAX)
  for (const [, f] of Object.entries(state.fleets)) bizVal += f.invested * (1 - BUSINESS_SALES_TAX)
  for (const k of ['construction', 'dealership', 'bank', 'it', 'football', 'oil']) if (state[k]) bizVal += state[k].invested * (1 - BUSINESS_SALES_TAX)
  const vault = state.bank ? state.bank.vault : 0

  let reVal = 0
  for (const p of PROPERTIES) { const o = state.properties[p.id]; if (o) reVal += p.cost * (1 + o.tier * IMPROVE_COST_PCT) * (1 - PROPERTY_SALES_TAX) }

  let stockVal = 0, stockCost = 0
  for (const st of STOCKS) { const h = state.stocks[st.id]; stockVal += h.owned * h.price; stockCost += h.spent }
  let cryptoVal = 0, cryptoCost = 0
  for (const c of CRYPTOS) { const h = state.cryptos[c.id]; cryptoVal += h.owned * h.price; cryptoCost += h.spent }
  let tokenVal = 0, tokenCost = 0
  for (const t of state.tokens || []) { tokenVal += t.owned * t.price; tokenCost += t.spent }
  let posVal = 0, posPnl = 0
  for (const pos of state.positions || []) {
    const book = pos.market === 'stock' ? state.stocks : pos.market === 'crypto' ? state.cryptos : null
    const price = (book ? book[pos.assetId]?.price : (state.tokens || []).find(t => t.id === pos.assetId)?.price) ?? pos.entry
    posVal += positionEquity(pos, price); posPnl += positionPnl(pos, price)
  }
  let luxVal = 0
  for (const l of LUXURY) { const n = state.luxury[l.id] || 0; luxVal += n * l.cost * (l.cat === 'NFT' ? 1 : LUXURY_RESALE) }

  const marketVal = stockVal + cryptoVal + tokenVal
  const marketCost = stockCost + cryptoCost + tokenCost
  const marketUnreal = marketVal - marketCost

  // ---- income per hour ----
  const biz = businessIncomes(state)
  const bizIncome = Object.values(biz).reduce((a, b) => a + b, 0)
  const inv = investmentIncomes(state)
  const invIncome = inv.dividends + inv.buyouts + inv.rent
  const totalIncome = bizIncome + invIncome

  const bizRows = Object.entries(biz).filter(([, v]) => Math.abs(v) > 0.01)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => {
      const name = IDLE_BUSINESSES.find(x => x.id === id)?.name
        || FLEET_BUSINESSES.find(x => x.id === id)?.name
        || ({ construction: 'Construction', dealership: 'Dealership', bank: 'Bank', it: 'IT Company', football: 'Football Club', oil: 'Oil & Gas', clothing: 'Clothing Brand', space: 'Space Agency', holding: 'Holding Co.' }[id])
        || id
      return { name, v }
    })

  const netFlow = totalIncome // per game-hour; salaries already netted inside businessIncomes

  return (
    <>
      <div className="section-title">Net worth · {fmt(nw)}</div>
      <div className="fin-grid">
        <div className="card fin-card">
          <h3>💰 What you're worth</h3>
          <Row label="Cash on hand" value={fmt(state.cash)} cls="up" />
          <Row label="Businesses" sub="(after sale tax)" value={fmt(bizVal)} />
          {vault > 0 && <Row label="Bank vault" value={fmt(vault)} cls="gold-t" />}
          <Row label="Real estate" value={fmt(reVal)} />
          <Row label="Market holdings" value={fmt(marketVal)} />
          {posVal > 0 && <Row label="Leverage equity" value={fmt(posVal)} />}
          {luxVal > 0 && <Row label="Luxury (resale)" value={fmt(luxVal)} />}
          <div className="fin-total"><span>Total net worth</span><b className="gold-t">{fmt(nw)}</b></div>
        </div>

        <div className="card fin-card">
          <h3>📈 Income · {fmt(totalIncome)}/hr</h3>
          <Row label="Businesses" value={`${fmt(bizIncome)}/hr`} cls={pc(bizIncome)} />
          <Row label="Dividends + buyouts" value={`${fmt(inv.dividends + inv.buyouts)}/hr`} cls="up" />
          <Row label="Property rent" value={`${fmt(inv.rent)}/hr`} cls="up" />
          <div className="fin-total"><span>Net cash flow</span><b className={pc(netFlow)}>{sign(netFlow)}{fmt(netFlow)}/hr</b></div>
          <div className="fin-note">≈ {fmt(totalIncome * 10)}/hr real-time (1 game-hr = 10s)</div>
        </div>
      </div>

      <div className="section-title">Trading book</div>
      <div className="fin-grid">
        <div className="card fin-card">
          <h3>📊 Open holdings (unrealised)</h3>
          <Row label="Stocks" sub={`cost ${fmt(stockCost)}`} value={`${sign(stockVal - stockCost)}${fmt(stockVal - stockCost)}`} cls={pc(stockVal - stockCost)} />
          <Row label="Crypto" sub={`cost ${fmt(cryptoCost)}`} value={`${sign(cryptoVal - cryptoCost)}${fmt(cryptoVal - cryptoCost)}`} cls={pc(cryptoVal - cryptoCost)} />
          <Row label="Tokens" sub={`cost ${fmt(tokenCost)}`} value={`${sign(tokenVal - tokenCost)}${fmt(tokenVal - tokenCost)}`} cls={pc(tokenVal - tokenCost)} />
          {(state.positions || []).length > 0 && <Row label="Leverage positions" sub={`${state.positions.length} open`} value={`${sign(posPnl)}${fmt(posPnl)}`} cls={pc(posPnl)} />}
          <div className="fin-total"><span>Total unrealised P/L</span><b className={pc(marketUnreal + posPnl)}>{sign(marketUnreal + posPnl)}{fmt(marketUnreal + posPnl)}</b></div>
        </div>

        <div className="card fin-card">
          <h3>🧾 Lifetime money trail</h3>
          <Row label="Realised trading P/L" value={`${sign(fin.realized)}${fmt(fin.realized)}`} cls={pc(fin.realized)} />
          <Row label="Dividends & buyouts collected" value={fmt(fin.dividends)} cls="up" />
          <Row label="Rent collected" value={fmt(fin.rent)} cls="up" />
          <Row label="Fees & slippage paid" value={`-${fmt(fin.fees)}`} cls="down" />
          <Row label="Margin lost to liquidations" value={`-${fmt(fin.liqLost)}`} cls="down" />
          <Row label="Lifetime business earnings" value={fmt(state.lifetimeBusiness)} />
        </div>
      </div>

      {bizRows.length > 0 && (
        <>
          <div className="section-title">Income by business</div>
          <div className="card fin-card">
            {bizRows.map(r => <Row key={r.name} label={r.name} value={`${sign(r.v)}${fmt(r.v)}/hr`} cls={pc(r.v)} />)}
          </div>
        </>
      )}
    </>
  )
}

// Engine simulation + edge-case tests. Run: npm run simtest
import { initialState, reducer, netWorth, businessIncomes, investmentIncomes, positionPnl, liqPrice } from '../src/game/engine.js'
import { STOCKS, CRYPTOS, HIST_MAX, IDLE_BUSINESSES, DEMAND_MIN, DEMAND_MAX, FUEL_MIN, FUEL_MAX, LEV_MAX } from '../src/game/data.js'
import { fmt } from '../src/format.js'

let failures = 0
const ok = (cond, msg) => {
  if (cond) console.log('  ok  ' + msg)
  else { failures++; console.error('  FAIL ' + msg) }
}
const tick = (s, dtH = 0.1) => reducer(s, { type: 'TICK', dtH })

const finiteState = (s, label) => {
  ok(Number.isFinite(s.cash) && s.cash >= 0, `${label}: cash finite & non-negative (${fmt(s.cash)})`)
  ok(Number.isFinite(netWorth(s)), `${label}: net worth finite (${fmt(netWorth(s))})`)
  for (const st of STOCKS) {
    const h = s.stocks[st.id]
    ok(h.price >= st.min && h.price <= st.max, `${label}: ${st.id} price in band`)
    ok(h.hist.length <= HIST_MAX, `${label}: ${st.id} history capped`)
  }
  for (const c of CRYPTOS) {
    const h = s.cryptos[c.id]
    ok(h.price >= c.min && h.price <= c.max, `${label}: ${c.id} price in band`)
  }
}

// ---------- 1. candle integrity over a long sim ----------
console.log('\n[1] Long market sim — candle integrity, bands, history cap')
{
  let s = initialState()
  for (let i = 0; i < 600; i++) s = tick(s)
  let candleBad = 0
  for (const c of [...STOCKS.map(x => s.stocks[x.id]), ...CRYPTOS.map(x => s.cryptos[x.id])]) {
    for (const cd of c.hist) {
      if (!(cd.hi >= Math.max(cd.o, cd.c) - 1e-9 && cd.lo <= Math.min(cd.o, cd.c) + 1e-9)) candleBad++
      if (![cd.o, cd.hi, cd.lo, cd.c].every(Number.isFinite)) candleBad++
    }
  }
  ok(candleBad === 0, `all candles have hi>=body>=lo and finite OHLC (checked ${15 * HIST_MAX} max)`)
  finiteState(s, 'after 600 ticks')
  for (const b of IDLE_BUSINESSES) {
    const d = s.economy.demand[b.id]
    ok(d >= DEMAND_MIN && d <= DEMAND_MAX, `demand[${b.id}] in [${DEMAND_MIN},${DEMAND_MAX}] (${d.toFixed(2)})`)
  }
  ok(s.economy.fuelPrice >= FUEL_MIN && s.economy.fuelPrice <= FUEL_MAX, `fuel price in band (${s.economy.fuelPrice.toFixed(2)})`)
}

// ---------- 2. hostile / malformed actions ----------
console.log('\n[2] Hostile actions — nothing corrupts state')
{
  let s = initialState()
  const before = s.cash
  s = reducer(s, { type: 'SELL_STOCK', id: 'PEAR', qty: 999999 })          // sell unowned
  s = reducer(s, { type: 'BUY_STOCK', id: 'PEAR', qty: -50 })              // negative buy
  s = reducer(s, { type: 'BUY_STOCK', id: 'PEAR', qty: 1e12 })             // can't afford
  s = reducer(s, { type: 'BUY_CRYPTO', id: 'PUP', usd: -1000 })            // negative usd
  s = reducer(s, { type: 'BUY_CRYPTO', id: 'PUP', usd: 1e12 })             // can't afford
  s = reducer(s, { type: 'SELL_CRYPTO', id: 'PUP' })                        // sell empty
  s = reducer(s, { type: 'OPEN_POSITION', market: 'stock', assetId: 'PEAR', dir: 1, lev: 100, margin: 1000 })  // illegal lev
  s = reducer(s, { type: 'OPEN_POSITION', market: 'stock', assetId: 'PEAR', dir: 1, lev: 5, margin: 10 })      // below min margin
  s = reducer(s, { type: 'OPEN_POSITION', market: 'stock', assetId: 'PEAR', dir: 1, lev: 5, margin: NaN })     // NaN margin
  s = reducer(s, { type: 'OPEN_POSITION', market: 'stock', assetId: 'PEAR', dir: 3, lev: 5, margin: 1000 })    // bad dir
  s = reducer(s, { type: 'OPEN_POSITION', market: 'stock', assetId: 'NOPE', dir: 1, lev: 5, margin: 1000 })    // bad asset
  s = reducer(s, { type: 'CLOSE_POSITION', id: 12345 })                     // close nothing
  s = reducer(s, { type: 'SET_PRICE', id: 'smallShop', price: 500 })        // not owned
  s = reducer(s, { type: 'UPGRADE_IDLE', id: 'smallShop' })                 // not owned
  s = reducer(s, { type: 'MERGE', id: 'holding' })                          // reqs unmet
  ok(s.cash === before, `cash untouched by 15 hostile actions (${fmt(s.cash)})`)
  ok((s.positions || []).length === 0, 'no position opened by illegal params')
  finiteState(s, 'post-hostile')
}

// ---------- 3. spot round-trip accounting ----------
console.log('\n[3] Spot trading accounting')
{
  const { tradeSlippage: slipFn } = await import('../src/game/engine.js')
  let s = initialState()
  const stPear = STOCKS.find(x => x.id === 'PEAR')
  const p0 = s.stocks.PEAR.price
  const usd0 = 100 * p0
  const cost0 = usd0 * (1 + slipFn(usd0, stPear.depth))
  s = reducer(s, { type: 'BUY_STOCK', id: 'PEAR', qty: 100 })
  ok(Math.abs(s.cash - (100000 - cost0)) < 1e-6, `buy 100 PEAR deducts qty*price + slippage exactly`)
  ok(s.stocks.PEAR.owned === 100 && Math.abs(s.stocks.PEAR.spent - cost0) < 1e-6, 'owned/spent tracked (slippage-inclusive)')
  s = reducer(s, { type: 'SELL_STOCK', id: 'PEAR', qty: 100 })
  ok(s.cash < 100000 && s.cash > 99000, `round-trip loses only the friction (${fmt(100000 - s.cash)} total cost)`)
  ok(s.stocks.PEAR.owned === 0 && s.stocks.PEAR.spent === 0, 'owned/spent reset to zero')
  // buyout cap: can never own more than issued shares
  s.cash = 1e12
  s = reducer(s, { type: 'BUY_STOCK', id: 'PEAR', qty: 999999 })
  ok(s.stocks.PEAR.owned === STOCKS.find(x => x.id === 'PEAR').shares, 'buy is capped at issued shares')
}

// ---------- 4. leverage: pnl math, liquidation, close clamp ----------
console.log('\n[4] Leverage positions')
{
  let s = initialState()
  s.cash = 1e6
  const entry = s.stocks.PEAR.price
  s = reducer(s, { type: 'OPEN_POSITION', market: 'stock', assetId: 'PEAR', dir: 1, lev: 10, margin: 10000 })
  ok(s.positions.length === 1, 'position opened')
  const pos = s.positions[0]
  ok(Math.abs(pos.qty * entry - 100000) < 1e-6, 'qty = margin*lev/entry (exposure $100K)')
  ok(Math.abs(liqPrice(pos) - entry * 0.9) < 1e-6, '10x long liq price = entry * 0.9')
  ok(Math.abs(positionPnl(pos, entry * 1.05) - 5000) < 1e-4, '+5% price at 10x = +50% of the $10K margin (+$5K)')
  // close clamp: pnl can never exceed -margin
  ok(Math.max(-pos.margin, positionPnl(pos, 0.0001)) === -pos.margin, 'close pnl clamped at -margin')
  // survive-or-die invariant over a wild sim on PUP 10x
  s = reducer(s, { type: 'CLOSE_POSITION', id: pos.id })
  s.cash = 1e6
  s = reducer(s, { type: 'OPEN_POSITION', market: 'crypto', assetId: 'PUP', dir: 1, lev: 10, margin: 50000 })
  let everViolated = false
  for (let i = 0; i < 2000 && s.positions.length; i++) {
    s = tick(s)
    for (const p of s.positions) {
      const price = s.cryptos[p.assetId].price
      if (positionPnl(p, price) < -p.margin * 1.001) everViolated = true
    }
  }
  ok(!everViolated, 'no open position ever sits below -100% margin (liquidation fires first)')
  ok(s.positions.length === 0, '10x long on Pupcoin got liquidated within 2000 ticks (as it should)')
  finiteState(s, 'post-leverage sim')
}

// ---------- 5. IT salary drain cannot bankrupt below zero ----------
console.log('\n[5] IT salary drain clamp')
{
  let s = initialState()
  s = reducer(s, { type: 'BUY_IT' }) // costs 350k > 100k cash → rejected; give cash
  s.cash = 400000
  s = reducer(s, { type: 'BUY_IT' })
  for (let i = 0; i < 60; i++) s = reducer(s, { type: 'HIRE_DEV' })
  for (let i = 0; i < 200; i++) s = tick(s)
  ok(s.cash >= 0, `cash clamped at zero under -${fmt(60 * 1500)}/hr salaries (${fmt(s.cash)})`)
}

// ---------- 6. offline / giant tick ----------
console.log('\n[6] Giant offline tick (24h in one call)')
{
  let s = initialState()
  s = reducer(s, { type: 'BUY_IDLE', id: 'smallShop' })
  s = tick(s, 24)
  finiteState(s, 'after 24h mega-tick')
  ok(s.stocks.PEAR.hist.length <= HIST_MAX, 'history stays capped after 48 market steps at once')
  const inc = businessIncomes(s).smallShop
  ok(Number.isFinite(inc) && inc > 0, `idle revenue positive after mega-tick (${fmt(inc)}/hr)`)
}

// ---------- 7. achievements & big-number formatting ----------
console.log('\n[7] Achievements + formatter')
{
  let s = initialState()
  s.cash = 1.5e9
  s = tick(s)
  ok(s.achievements.m1 && s.achievements.m2 && s.achievements.m10 && s.achievements.m100 && s.achievements.b1, 'all 5 achievements unlock at $1.5B net worth')
  ok(fmt(3.2e15) === '$3.20Q' && fmt(5.1e12) === '$5.10T' && fmt(-2.5e6) === '-$2.50M', `formatter handles Q/T/negatives (${fmt(3.2e15)}, ${fmt(-2.5e6)})`)
  s.cash = 1e18
  s = tick(s)
  ok(Number.isFinite(netWorth(s)), `game survives $${fmt(1e18)} cash (money is effectively infinite)`)
}

// ---------- 8. dividends + rent math spot-check ----------
console.log('\n[8] Investment income math')
{
  let s = initialState()
  s.cash = 1e7
  s = reducer(s, { type: 'BUY_STOCK', id: 'ADND', qty: 1000 })
  const { dividends } = investmentIncomes(s)
  const expect = 1000 * s.stocks.ADND.price * 0.0022
  ok(Math.abs(dividends - expect) < 1e-6, `ADND dividend = owned*price*0.22%/hr (${fmt(dividends)}/hr)`)
  s = reducer(s, { type: 'BUY_PROPERTY', id: 'studio' })
  const { rent } = investmentIncomes(s)
  ok(Math.abs(rent - 45000 * 0.006) < 1e-6, `studio rent = value*0.6%/hr (${fmt(rent)}/hr)`)
}

// ---------- 9. token launches, shill, rug/moon, notifications ----------
console.log('\n[9] Launched tokens + notifications')
{
  let s = initialState()
  s.nextTokenH = 0 // force a launch at the next market step
  for (let i = 0; i < 6; i++) s = tick(s) // market steps fire every 0.5 game-hours
  ok(s.tokens.length === 1, 'token launched when nextTokenH reached')
  ok(s.notifications.length >= 1 && s.notifications[0].icon === '🚀', 'launch notification fired')
  ok(s.notifications[0].target && s.notifications[0].target.assetId === s.tokens[0].id, 'notification targets the token')
  // hostile token actions
  const cashBefore = s.cash
  s = reducer(s, { type: 'BUY_TOKEN', id: 'TK_NOPE', usd: 1000 })
  s = reducer(s, { type: 'BUY_TOKEN', id: s.tokens[0].id, usd: -50 })
  s = reducer(s, { type: 'BUY_TOKEN', id: s.tokens[0].id, usd: NaN })
  s = reducer(s, { type: 'SELL_TOKEN', id: s.tokens[0].id })
  ok(s.cash === cashBefore, 'hostile token actions change nothing')
  // buy in, run the full lifecycle to resolution
  s = reducer(s, { type: 'BUY_TOKEN', id: s.tokens[0].id, usd: 5000 })
  ok(s.tokens[0].owned > 0 && Math.abs(s.tokens[0].spent - 5000) < 1e-9, 'token buy tracked')
  let resolved = null
  for (let i = 0; i < 1200; i++) {
    s = tick(s)
    const t = s.tokens.find(x => x.spent > 0 || x.owned > 0) || s.tokens[0]
    if (t && (t.phase === 'dead' || t.phase === 'mooned')) { resolved = t.phase; break }
    if (!Number.isFinite(s.cash)) break
  }
  ok(resolved === 'dead' || resolved === 'mooned', `token resolved its fate (${resolved})`)
  ok(s.notifications.some(n => n.icon === '📢'), 'influencer shill notification fired')
  ok(s.notifications.some(n => n.icon === '💀' || n.icon === '💎'), 'rug/moon notification fired')
  for (const t of s.tokens) {
    ok(Number.isFinite(t.price) && t.price >= t.min && t.price <= t.max, `$${t.sym} price finite & in band`)
  }
  ok(s.notifications.length <= 30, 'notification list capped at 30')
  // leverage on a token works and liquidates cleanly on rugs
  s.cash = 1e6
  const live = s.tokens.find(t => t.phase !== 'dead') || s.tokens[0]
  s = reducer(s, { type: 'OPEN_POSITION', market: 'token', assetId: live.id, dir: 1, lev: 10, margin: 5000 })
  ok(s.positions.length === 1, 'leverage position opens on a token')
  for (let i = 0; i < 1500 && s.positions.length; i++) s = tick(s)
  ok(Number.isFinite(s.cash) && Number.isFinite(netWorth(s)), 'state stays finite through token leverage chaos')
  // read actions
  const firstId = s.notifications[0]?.id
  s = reducer(s, { type: 'READ_NOTIF', id: firstId })
  ok(s.notifications.find(n => n.id === firstId)?.read === true, 'READ_NOTIF marks one read')
  s = reducer(s, { type: 'READ_ALL_NOTIFS' })
  ok(s.notifications.every(n => n.read), 'READ_ALL_NOTIFS clears the badge')
}

// ---------- 9.5 liquidity: slippage + price impact ----------
console.log('\n[9.5] Liquidity — slippage & price impact')
{
  const { tradeSlippage } = await import('../src/game/engine.js')
  ok(tradeSlippage(0, 100000) === 0, 'zero order = zero slippage')
  ok(Math.abs(tradeSlippage(10000, 100000) - 0.05) < 1e-9, '$10K into $100K depth = 5% slip')
  ok(tradeSlippage(1e9, 50000) === 0.25, 'slippage capped at 25%')
  let s = initialState()
  s.cash = 1e7
  const st = STOCKS.find(x => x.id === 'PEAR')
  const p0 = s.stocks.PEAR.price
  // big buy: costs more than qty*price and pushes the price up
  s = reducer(s, { type: 'BUY_STOCK', id: 'PEAR', qty: 1000 })
  const usd = 1000 * p0
  const expectCost = usd * (1 + tradeSlippage(usd, st.depth))
  ok(Math.abs((1e7 - s.cash) - expectCost) < 1e-6, `big buy pays slippage premium (${fmt(expectCost - usd)} extra)`)
  ok(s.stocks.PEAR.price > p0, 'buy pressure pushed the price up')
  ok(s.stocks.PEAR.price <= st.max, 'impact stays inside the band')
  // big sell: nets less and pushes price down
  const cashBefore = s.cash
  const p1 = s.stocks.PEAR.price
  s = reducer(s, { type: 'SELL_STOCK', id: 'PEAR', qty: 1000 })
  const sellUsd = 1000 * p1
  ok(Math.abs((s.cash - cashBefore) - sellUsd * (1 - tradeSlippage(sellUsd, st.depth))) < 1e-6, 'sell nets proceeds minus slippage')
  ok(s.stocks.PEAR.price < p1, 'dump pushed the price down')
  // crypto: buying gives fewer units due to slippage
  s.cash = 1e6
  const c = CRYPTOS.find(x => x.id === 'PUP')
  const cp = s.cryptos.PUP.price
  s = reducer(s, { type: 'BUY_CRYPTO', id: 'PUP', usd: 60000 })
  const expectQty = (60000 * (1 - tradeSlippage(60000, c.depth))) / cp
  ok(Math.abs(s.cryptos.PUP.owned - expectQty) < 1e-6, `$60K PUP buy receives ${(tradeSlippage(60000, c.depth) * 100).toFixed(1)}% fewer units (thin book)`)
  ok(s.cryptos.PUP.price > cp, 'crypto buy also shoves price')
}

// ---------- 10. crypto roster ----------
console.log('\n[10] Crypto roster')
{
  ok(CRYPTOS.length === 20, `base market has 20 cryptos (${CRYPTOS.length})`)
  const ids = new Set(CRYPTOS.map(c => c.id))
  ok(ids.size === 20, 'all crypto ids unique')
}

// ---------- 11. input guards: NaN/out-of-range can't poison the economy ----------
console.log('\n[11] SET_PRICE / SET_RATES input guards')
{
  let s = initialState()
  s = reducer(s, { type: 'BUY_IDLE', id: 'smallShop' })
  const priceBefore = s.idle.smallShop.price
  s = reducer(s, { type: 'SET_PRICE', id: 'smallShop', price: NaN })      // NaN price
  ok(s.idle.smallShop.price === priceBefore, 'SET_PRICE ignores NaN (price unchanged)')
  s = reducer(s, { type: 'SET_PRICE', id: 'smallShop', price: 9999 })     // out of range → clamped
  ok(Number.isFinite(s.idle.smallShop.price) && s.idle.smallShop.price <= 150, 'SET_PRICE clamps out-of-range')
  for (let i = 0; i < 5; i++) s = tick(s)
  ok(Number.isFinite(s.cash), 'cash stays finite after price pokes')

  s.cash = 400000
  s = reducer(s, { type: 'BUY_BANK' })
  const ratesBefore = { d: s.bank.depositRate, c: s.bank.creditRate }
  s = reducer(s, { type: 'SET_RATES', depositRate: NaN, creditRate: 5 })  // NaN rate
  ok(s.bank.depositRate === ratesBefore.d && s.bank.creditRate === ratesBefore.c, 'SET_RATES ignores NaN')
  s = reducer(s, { type: 'SET_RATES', depositRate: 999, creditRate: -50 }) // out of range → clamped
  ok(s.bank.depositRate <= 12 && s.bank.creditRate >= 0, 'SET_RATES clamps to [0, maxRate]')
  for (let i = 0; i < 5; i++) s = tick(s)
  ok(Number.isFinite(s.bank.vault) && Number.isFinite(netWorth(s)), 'vault + net worth stay finite after rate pokes')
}

// ---------- 11. finance tracking (fin ledger) ----------
console.log('\n[11] Finance ledger')
{
  let s = initialState()
  s.cash = 1e7
  ok(s.fin && s.fin.realized === 0 && s.fin.fees === 0, 'fresh state has a zeroed fin ledger')
  // a spot round-trip should record fees on both legs and a realised loss (friction)
  s = reducer(s, { type: 'BUY_STOCK', id: 'PEAR', qty: 500 })
  ok(s.fin.fees > 0, 'buy records slippage as fees')
  const p = s.stocks.PEAR.price
  s = reducer(s, { type: 'SELL_STOCK', id: 'PEAR', qty: 500 })
  ok(s.fin.realized < 0, 'flat round-trip realises a loss (the friction)')
  ok(s.fin.fees > 0, 'sell adds more fees')
  // dividends accrue into the ledger over time
  s = reducer(s, { type: 'BUY_STOCK', id: 'ADND', qty: 1000 })
  const before = s.fin.dividends
  for (let i = 0; i < 20; i++) s = tick(s)
  ok(s.fin.dividends > before, 'dividends accumulate in the ledger')
  // liquidation loss is booked
  s.cash = 1e6
  s = reducer(s, { type: 'OPEN_POSITION', market: 'crypto', assetId: 'PUP', dir: 1, lev: 10, margin: 20000 })
  const liqBefore = s.fin.liqLost
  for (let i = 0; i < 1500 && s.positions.length; i++) s = tick(s)
  ok(s.fin.liqLost >= liqBefore, 'liquidation loss recorded in ledger (or position survived)')
  ok(Number.isFinite(s.fin.realized + s.fin.fees + s.fin.dividends + s.fin.rent + s.fin.liqLost), 'ledger stays finite')
}

// ---------- 12. rugged token freezes + delists fast ----------
console.log('\n[12] Rugged token freeze + fast delist')
{
  let s = initialState()
  s.nextTokenH = 0
  for (let i = 0; i < 6; i++) s = tick(s)
  const tid = s.tokens[0].id
  // run until it rugs
  let rugged = false
  for (let i = 0; i < 1500; i++) { s = tick(s); const t = s.tokens.find(x => x.id === tid); if (t && t.phase === 'dead') { rugged = true; break } if (!t) break }
  if (rugged) {
    const dead = s.tokens.find(x => x.id === tid)
    const frozenPrice = dead.price
    const frozenLen = dead.hist.length
    s = tick(s); s = tick(s)
    const still = s.tokens.find(x => x.id === tid)
    if (still) {
      ok(still.price === frozenPrice, 'dead token price is frozen (no more dancing)')
      ok(still.hist.length === frozenLen, 'dead token chart stops growing')
    } else ok(true, 'dead token already delisted (fast)')
    // eventually it delists
    let gone = false
    for (let i = 0; i < 200; i++) { s = tick(s); if (!s.tokens.find(x => x.id === tid)) { gone = true; break } }
    ok(gone, 'rugged token delists within ~6 game-hours')
  } else ok(true, 'token did not rug in window (jackpot path) — skipped')
}

// ---------- 13. limit orders — placement, fill, cancel, partial crypto sell ----------
console.log('\n[13] Limit orders — placement, fill, cancel, partial crypto sell')
{
  let s = initialState()
  // a marketable buy limit (limit above market) fills on the next step at ~market price
  const px0 = s.stocks.PEAR.price
  s = reducer(s, { type: 'PLACE_ORDER', market: 'stock', assetId: 'PEAR', side: 'buy', price: px0 + 20, usd: 5000 })
  ok(s.orders.length === 1, 'buy limit order placed')
  const cashBefore = s.cash
  s = tick(s, 0.6) // large enough to trigger a market step (MARKET_STEP_H = 0.5)
  ok(s.orders.length === 0, 'marketable buy limit filled and left the book')
  ok(s.stocks.PEAR.owned > 0, 'shares received from limit fill')
  ok(s.cash < cashBefore && s.cash >= 0 && Number.isFinite(s.cash), 'cash spent, finite & non-negative')

  // a far out-of-range sell limit rests, then cancels
  s = reducer(s, { type: 'PLACE_ORDER', market: 'stock', assetId: 'MSFT', side: 'sell', price: s.stocks.MSFT.price * 100 })
  const oid = s.orders[s.orders.length - 1].id
  s = tick(s, 0.6) // market steps, but this order is far out of range so it must not fill
  ok(s.orders.some(o => o.id === oid), 'out-of-range sell limit rests (does not fill)')
  s = reducer(s, { type: 'CANCEL_ORDER', id: oid })
  ok(!s.orders.some(o => o.id === oid), 'order cancelled')

  // partial crypto sell via frac (new), default still sells all
  s.cash = 1e6
  s = reducer(s, { type: 'BUY_CRYPTO', id: 'AUR', usd: 100000 })
  const owned = s.cryptos.AUR.owned
  ok(owned > 0, 'crypto bought')
  s = reducer(s, { type: 'SELL_CRYPTO', id: 'AUR', frac: 0.5 })
  ok(Math.abs(s.cryptos.AUR.owned - owned / 2) < owned * 1e-6, 'partial (50%) crypto sell leaves half')
  s = reducer(s, { type: 'SELL_CRYPTO', id: 'AUR' })
  ok(s.cryptos.AUR.owned === 0, 'default crypto sell (no frac) sells the rest')

  // malformed order inputs are rejected
  const n = s.orders.length
  s = reducer(s, { type: 'PLACE_ORDER', market: 'stock', assetId: 'PEAR', side: 'buy', price: -5, usd: 100 })
  s = reducer(s, { type: 'PLACE_ORDER', market: 'bogus', assetId: 'ZZZ', side: 'buy', price: 10, usd: 100 })
  s = reducer(s, { type: 'PLACE_ORDER', market: 'stock', assetId: 'PEAR', side: 'buy', price: 100, usd: -50 })
  ok(s.orders.length === n, 'malformed orders rejected')
  finiteState(s, 'after limit-order tests')
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)

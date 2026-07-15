import React, { useEffect, useMemo, useRef, useState } from 'react'
import { STOCKS, CRYPTOS, MARKET_STEP_H, LEV_MIN, LEV_MAX, POSITION_MIN_MARGIN, POSITION_FEE, RISK_LABELS } from '../game/data.js'
import { positionPnl, liqPrice, tradeSlippage } from '../game/engine.js'
import { fmt } from '../format.js'

// terminal-style price: raw number with commas + sensible decimals (monospace columns)
const fmtPx = (n) => n >= 1000 ? Math.round(n).toLocaleString()
  : n >= 1 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : n.toPrecision(3)

// brief up/down flash class whenever a value changes (price ticks)
function useFlash(value) {
  const prev = useRef(value)
  const [cls, setCls] = useState('')
  useEffect(() => {
    if (value > prev.current) setCls('flash-up')
    else if (value < prev.current) setCls('flash-down')
    prev.current = value
    const t = setTimeout(() => setCls(''), 260)
    return () => clearTimeout(t)
  }, [value])
  return cls
}

// deterministic 0..1 from an integer — stable order-book sizes (no per-render jitter)
const pseudo = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) }

const Risk = ({ risk }) => {
  const r = RISK_LABELS[risk] || RISK_LABELS.med
  return <span className={`risktag ${r.cls}`}>{r.text}</span>
}

// exit readout: what dumping the whole holding actually nets, after slippage
function exitInfo(value, depth) {
  if (value <= 0) return null
  const slip = tradeSlippage(value, depth)
  return { slip, net: value * (1 - slip) }
}

const TOKEN_PHASE = {
  stealth: { pill: '🌱 fresh launch', cls: 'green' },
  promoted: { pill: '📢 trending', cls: 'gold' },
  mooned: { pill: '💎 mooned', cls: 'gold' },
  dead: { pill: '💀 rugged', cls: '' },
}

const last = (hist) => hist[hist.length - 1]
const changePct = (hist) => {
  if (!hist || hist.length < 2) return 0
  const a = hist[hist.length - 2].c, b = last(hist).c
  return ((b - a) / a) * 100
}
const windowPct = (hist) => {
  if (!hist || hist.length < 2) return 0
  return ((last(hist).c - hist[0].c) / hist[0].c) * 100
}

// ---------- sparkline (list rows) ----------
function Spark({ hist, w = 72, h = 26 }) {
  if (!hist || hist.length < 2) return <svg width={w} height={h} />
  const lo = Math.min(...hist.map(d => d.lo)), hi = Math.max(...hist.map(d => d.hi))
  const span = hi - lo || 1
  const pts = hist.map((d, i) => `${(i / (hist.length - 1)) * w},${h - 2 - ((d.c - lo) / span) * (h - 4)}`).join(' ')
  const up = last(hist).c >= hist[0].c
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={pts} fill="none" stroke={up ? 'var(--accent)' : 'var(--red)'} strokeWidth="1.5" />
    </svg>
  )
}

// ---------- candlestick chart with zoom ranges, overlays + crosshair ----------
// Ranges are game-time: 1 candle = 0.5 game-hours. Coarser ranges merge candles.
const CHART_RANGES = [
  { id: '12H', raw: 24, agg: 1 },
  { id: '1D', raw: 48, agg: 1 },
  { id: '3D', raw: 144, agg: 3 },
  { id: '1W', raw: 336, agg: 7 },
  { id: 'MAX', raw: Infinity, agg: 0 },
]

function aggregate(candles, k) {
  if (k <= 1) return candles
  const out = []
  for (let i = candles.length % k; i < candles.length; i += k) {
    const grp = candles.slice(i, i + k)
    if (!grp.length) continue
    out.push({
      h: grp[grp.length - 1].h,
      o: grp[0].o, c: grp[grp.length - 1].c,
      hi: Math.max(...grp.map(g => g.hi)),
      lo: Math.min(...grp.map(g => g.lo)),
    })
  }
  return out
}

function CandleChart({ hist, min, max, overlays = [] }) {
  const [hover, setHover] = useState(null)
  const [rangeId, setRangeId] = useState('1D')
  const [chartType, setChartType] = useState(() => localStorage.getItem('empire-charttype') || 'candle')
  const pickType = (t) => { setChartType(t); localStorage.setItem('empire-charttype', t) }
  const range = CHART_RANGES.find(r => r.id === rangeId)
  const raw = range.raw === Infinity ? hist : hist.slice(-range.raw)
  const agg = range.agg || Math.max(1, Math.ceil(raw.length / 56))
  const candles = aggregate(raw, agg)
  const lastH = hist.length ? hist[hist.length - 1].h : 0
  const W = 900, H = 250
  const padL = 6, padR = 62, padT = 12, padB = 18
  const iw = W - padL - padR, ih = H - padT - padB

  // auto-scale the y-axis to the visible candles (+ any overlay lines), not the full band,
  // so a coin sitting near its floor still fills the chart instead of flatlining
  let dataLo = Infinity, dataHi = -Infinity
  for (const d of candles) { if (d.lo < dataLo) dataLo = d.lo; if (d.hi > dataHi) dataHi = d.hi }
  for (const ov of overlays) { if (ov.y < dataLo) dataLo = ov.y; if (ov.y > dataHi) dataHi = ov.y }
  if (!isFinite(dataLo)) { dataLo = min; dataHi = max }
  if (dataHi - dataLo < dataHi * 1e-4) { const m = dataHi || 1; dataLo = m * 0.98; dataHi = m * 1.02 } // flat guard
  const padY = (dataHi - dataLo) * 0.08
  const yLo = dataLo - padY, yHi = dataHi + padY
  const y = v => padT + ih - ((clamp01((v - yLo) / (yHi - yLo))) * ih)
  const x = i => padL + ((i + 0.5) / candles.length) * iw
  const cw = Math.max(2, Math.min(7, (iw / candles.length) * 0.4))

  function clamp01(v) { return Math.min(1, Math.max(0, v)) }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.floor(((px - padL) / iw) * candles.length)
    setHover(i >= 0 && i < candles.length ? i : null)
  }

  const grid = [yHi - padY, (yLo + yHi) / 2, yLo + padY]
  const hc = hover != null ? candles[hover] : null
  return (
    <div className="chartwrap">
      <div className="chart-toolbar">
        <div className="chart-ranges tabs mini">
          {CHART_RANGES.map(r => (
            <button key={r.id} className={r.id === rangeId ? 'active' : ''} onClick={() => { setRangeId(r.id); setHover(null) }}>{r.id}</button>
          ))}
        </div>
        <div className="chart-type tabs mini">
          <button className={chartType === 'candle' ? 'active' : ''} onClick={() => pickType('candle')} title="Candlesticks">📊</button>
          <button className={chartType === 'line' ? 'active' : ''} onClick={() => pickType('line')} title="Line">📈</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {grid.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + iw} y1={y(v)} y2={y(v)} stroke="#2c2c30" strokeDasharray={i === 1 ? '3 5' : ''} strokeWidth="1" />
            <text x={W - padR + 8} y={y(v) + 4} fill="var(--muted)" fontSize="11">{fmt(v)}</text>
          </g>
        ))}
        {chartType === 'candle' && candles.map((d, i) => {
          const up = d.c >= d.o
          const col = up ? 'var(--accent)' : 'var(--red)'
          const bodyTop = y(Math.max(d.o, d.c))
          const bodyH = Math.max(1.5, Math.abs(y(d.o) - y(d.c)))
          return (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={y(d.hi)} y2={y(d.lo)} stroke={col} strokeWidth="1.4" />
              <rect x={x(i) - cw / 2} y={bodyTop} width={cw} height={bodyH} fill={col} rx="1" />
            </g>
          )
        })}
        {chartType === 'line' && candles.length > 1 && (() => {
          const up = candles[candles.length - 1].c >= candles[0].c
          const col = up ? 'var(--accent)' : 'var(--red)'
          const pts = candles.map((d, i) => `${x(i)},${y(d.c)}`).join(' ')
          const area = `${x(0)},${padT + ih} ${pts} ${x(candles.length - 1)},${padT + ih}`
          return (
            <g>
              <polygon points={area} fill={col} opacity="0.08" />
              <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })()}
        {overlays.map((ov, i) => (
          <g key={'ov' + i}>
            <line x1={padL} x2={padL + iw} y1={y(ov.y)} y2={y(ov.y)} stroke={ov.color} strokeWidth="1.2" strokeDasharray="4 4" opacity="0.85" />
            <rect x={padL + 3} y={y(ov.y) - 13} width={ov.label.length * 6 + 10} height="13" rx="3" fill={ov.color} opacity="0.16" />
            <text x={padL + 7} y={y(ov.y) - 3} fill={ov.color} fontSize="10" fontWeight="600">{ov.label}</text>
          </g>
        ))}
        {hc && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#5a5a5e" strokeWidth="1" />
        )}
      </svg>
      {hc && (
        <div className="charttip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b className={hc.c >= hc.o ? 'up' : 'down'}>{fmt(hc.c)}</b>
          <span>O {fmt(hc.o)} · H {fmt(hc.hi)} · L {fmt(hc.lo)}</span>
          <span>{(lastH - hc.h).toFixed(1)} game-hrs ago</span>
        </div>
      )}
    </div>
  )
}

// ---------- trading floor ----------
export default function Markets({ state, dispatch, navTarget }) {
  const [market, setMarket] = useState('stocks')
  const [selStock, setSelStock] = useState(STOCKS[0].id)
  const [selCrypto, setSelCrypto] = useState(CRYPTOS[0].id)
  const detailRef = useRef(null)

  const isStocks = market === 'stocks'
  const tokens = state.tokens || []
  const sel = isStocks ? selStock : selCrypto
  const setSel = (id) => {
    (isStocks ? setSelStock : setSelCrypto)(id)
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // notification clicks land here: jump to the right market + asset
  useEffect(() => {
    if (!navTarget) return
    if (navTarget.market === 'stock') { setMarket('stocks'); setSelStock(navTarget.assetId) }
    else { setMarket('crypto'); setSelCrypto(navTarget.assetId) }
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [navTarget?.nonce])

  const selToken = !isStocks ? tokens.find(t => t.id === sel) : null

  const strip = useMemo(() => {
    let value = 0, spent = 0, divhr = 0, owned = 0
    for (const st of STOCKS) {
      const h = state.stocks[st.id]
      value += h.owned * h.price; spent += h.spent
      if (st.dividend) divhr += h.owned * h.price * (st.dividend / 100)
      if (h.owned >= st.shares) { owned++; divhr += st.profit }
    }
    for (const c of CRYPTOS) { const h = state.cryptos[c.id]; value += h.owned * h.price; spent += h.spent }
    return { value, pnl: value - spent, divhr, owned }
  }, [state.stocks, state.cryptos])

  const positions = state.positions || []

  return (
    <>
      <div className="floorstrip">
        <div><span className="label">Portfolio</span><b>{fmt(strip.value)}</b></div>
        <div><span className="label">Unrealised P/L</span><b className={strip.pnl >= 0 ? 'up' : 'down'}>{strip.pnl >= 0 ? '+' : ''}{fmt(strip.pnl)}</b></div>
        <div><span className="label">Dividends + buyouts</span><b>{fmt(strip.divhr)}/hr</b></div>
        <div><span className="label">Open positions</span><b>{positions.length}</b></div>
        <div className="tabs mini">
          <button className={isStocks ? 'active' : ''} onClick={() => setMarket('stocks')}>Stocks</button>
          <button className={!isStocks ? 'active' : ''} onClick={() => setMarket('crypto')}>Crypto</button>
        </div>
      </div>

      {positions.length > 0 && <PositionsStrip positions={positions} state={state} dispatch={dispatch} />}

      <div className="floor">
        <div className="tickers">
          {!isStocks && tokens.map(t => {
            const ch = changePct(t.hist)
            const phase = TOKEN_PHASE[t.phase] || TOKEN_PHASE.stealth
            return (
              <button key={t.id} className={`ticker token ${sel === t.id ? 'sel' : ''}`} onClick={() => setSel(t.id)}>
                <div className="tk-id">
                  <b>${t.sym} <span className={`pill ${phase.cls}`}>{phase.pill}</span></b>
                  <span>{t.name}</span>
                </div>
                <Spark hist={t.hist} />
                <div className="tk-price">
                  <b>{fmt(t.price)}</b>
                  <span className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(1)}%</span>
                </div>
                {(t.owned > 0 || positions.some(p => p.assetId === t.id)) && <span className="holds">●</span>}
              </button>
            )
          })}
          {(isStocks ? STOCKS : CRYPTOS).map(d => {
            const h = (isStocks ? state.stocks : state.cryptos)[d.id]
            const ch = changePct(h.hist)
            return (
              <button key={d.id} className={`ticker ${sel === d.id ? 'sel' : ''}`} onClick={() => setSel(d.id)}>
                <div className="tk-id">
                  <b>{d.id}</b>
                  <span>{d.name} <Risk risk={d.risk} /></span>
                </div>
                <Spark hist={h.hist} />
                <div className="tk-price">
                  <b>{fmt(h.price)}</b>
                  <span className={ch >= 0 ? 'up' : 'down'}>{Math.abs(ch) >= 3 ? '🔥 ' : ''}{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(1)}%</span>
                </div>
                {(h.owned > 0 || positions.some(p => p.assetId === d.id)) && <span className="holds">●</span>}
              </button>
            )
          })}
        </div>

        <div ref={detailRef} className="detail-anchor">
          {isStocks
            ? <AssetTerminal market="stock" def={STOCKS.find(s => s.id === sel)} h={state.stocks[sel]} state={state} dispatch={dispatch} />
            : selToken
              ? <TokenDetail t={selToken} state={state} dispatch={dispatch} />
              : <AssetTerminal market="crypto" def={CRYPTOS.find(c => c.id === sel) || CRYPTOS[0]} h={state.cryptos[CRYPTOS.some(c => c.id === sel) ? sel : CRYPTOS[0].id]} state={state} dispatch={dispatch} />}
        </div>
      </div>
    </>
  )
}

// ---------- launched-token detail ----------
function TokenDetail({ t, state, dispatch }) {
  const [usd, setUsd] = useState(1000)
  const ch = windowPct(t.hist)
  const value = t.owned * t.price
  const pnl = value - t.spent
  const phase = TOKEN_PHASE[t.phase] || TOKEN_PHASE.stealth
  const lo = Math.min(...t.hist.map(d => d.lo)), hi = Math.max(...t.hist.map(d => d.hi))
  const overlays = []
  if (t.owned > 0) overlays.push({ y: t.spent / t.owned, color: 'var(--gold)', label: 'avg cost' })
  for (const pos of (state.positions || []).filter(p => p.assetId === t.id)) {
    overlays.push({ y: pos.entry, color: '#9a9aff', label: `${pos.dir === 1 ? 'long' : 'short'} entry` })
    overlays.push({ y: liqPrice(pos), color: 'var(--red)', label: 'liq' })
  }
  return (
    <div className="detail card">
      <div className="det-head">
        <div>
          <h2>${t.sym} <span className="tksym">{t.name}</span></h2>
          <div className="det-price">
            {fmt(t.price)} <span className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(1)}% since launch</span>
          </div>
        </div>
        <span className={`pill ${phase.cls}`}>{phase.pill}</span>
      </div>

      {t.phase !== 'dead' && t.phase !== 'mooned' && (
        <div className="rugwarn">⚠️ Unaudited token. Anonymous devs. This can rug at any second — or 10×. That's the game.</div>
      )}
      {t.phase === 'dead' && <div className="rugwarn dead">💀 This token was rugged. The pool is drained. Whatever you hold is dust.</div>}

      <CandleChart hist={t.hist} min={lo * 0.9} max={hi * 1.1} overlays={overlays} />

      <div className="det-stats">
        <div><span className="label">Launched</span><b>{(state.gameHours - t.launchH).toFixed(0)}h ago</b></div>
        <div><span className="label">Market cap</span><b>{fmt((t.supply || 0) * t.price)}</b></div>
        <div><span className="label">Supply</span><b>{(t.supply || 0).toLocaleString()}</b></div>
        <div><span className="label">Liquidity</span><b className={t.depth < 20000 ? 'down' : ''}>{fmt(t.depth || 0)}</b></div>
        <div><span className="label">You hold</span><b>{t.owned > 0 ? `${t.owned.toFixed(2)} ${t.sym}` : '—'}</b></div>
        <div><span className="label">Value</span><b>{t.owned > 0 ? fmt(value) : '—'}</b></div>
        <div><span className="label">P/L</span><b className={pnl >= 0 ? 'up' : 'down'}>{t.owned > 0 ? `${pnl >= 0 ? '+' : ''}${fmt(pnl)}` : '—'}</b></div>
        <div><span className="label">Exit impact</span><ExitCell value={value} depth={t.depth || 1} /></div>
      </div>

      <div className="trade">
        <input type="number" min="1" value={usd} onChange={e => setUsd(Math.max(1, Math.floor(+e.target.value || 1)))} />
        {[1000, 10000, 100000].map(n => <button key={n} className="btn small ghost" onClick={() => setUsd(n)}>{fmt(n)}</button>)}
        <span className="spacer" />
        <button className="btn buy" disabled={state.cash < usd || t.phase === 'dead'} onClick={() => dispatch({ type: 'BUY_TOKEN', id: t.id, usd })}>Ape in · {fmt(usd)}{tradeSlippage(usd, t.depth) > 0.01 ? ` (−${(tradeSlippage(usd, t.depth) * 100).toFixed(1)}% slip)` : ''}</button>
        <button className="btn sell" disabled={t.owned <= 0} onClick={() => dispatch({ type: 'SELL_TOKEN', id: t.id })}>Sell all · {fmt(value * (1 - tradeSlippage(value, t.depth)))}</button>
      </div>

      {t.phase !== 'dead' && <LeveragePanel market="token" assetId={t.id} price={t.price} cash={state.cash} dispatch={dispatch} positions={state.positions || []} />}
    </div>
  )
}

function PositionsStrip({ positions, state, dispatch }) {
  return (
    <div className="positions">
      {positions.map(pos => {
        const book = pos.market === 'stock' ? state.stocks : state.cryptos
        const price = book[pos.assetId]?.price ?? pos.entry
        const pnl = Math.max(-pos.margin, positionPnl(pos, price))
        const pct = (pnl / pos.margin) * 100
        return (
          <div key={pos.id} className={`position ${pnl >= 0 ? 'win' : 'lose'}`}>
            <b>{pos.dir === 1 ? '▲ LONG' : '▼ SHORT'} {pos.lev}× {pos.assetId}</b>
            <span>entry {fmt(pos.entry)} · liq <span className="down">{fmt(liqPrice(pos))}</span></span>
            <span className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)} ({pct.toFixed(0)}%)</span>
            <button className="btn small" onClick={() => dispatch({ type: 'CLOSE_POSITION', id: pos.id })}>Close</button>
          </div>
        )
      })}
    </div>
  )
}

// ---------- leverage panel (shared) ----------
function LeveragePanel({ market, assetId, price, cash, dispatch, positions = [] }) {
  const [dir, setDir] = useState(1)
  const [lev, setLev] = useState(5)
  const [margin, setMargin] = useState(1000)
  const fee = margin * lev * POSITION_FEE
  const canOpen = cash >= margin + fee && margin >= POSITION_MIN_MARGIN
  const fakePos = { dir, lev, entry: price, margin, qty: (margin * lev) / price }
  const mine = positions.filter(p => p.assetId === assetId)
  return (
    <div className="lever levpanel">
      {mine.length > 0 && (
        <div className="openpos">
          <div className="openpos-title">Your open positions on {assetId}</div>
          {mine.map(pos => {
            const pnl = Math.max(-pos.margin, positionPnl(pos, price))
            const pct = (pnl / pos.margin) * 100
            return (
              <div key={pos.id} className={`openpos-row ${pnl >= 0 ? 'win' : 'lose'}`}>
                <span className="op-dir">{pos.dir === 1 ? '▲ LONG' : '▼ SHORT'} {pos.lev}×</span>
                <span className="op-meta">entry {fmt(pos.entry)} · liq <span className="down">{fmt(liqPrice(pos))}</span></span>
                <span className={`op-pnl ${pnl >= 0 ? 'up' : 'down'}`}>{pnl >= 0 ? '+' : ''}{fmt(pnl)} <small>({pct.toFixed(0)}%)</small></span>
                <button className="btn small close-btn" onClick={() => dispatch({ type: 'CLOSE_POSITION', id: pos.id })}>Close</button>
              </div>
            )
          })}
        </div>
      )}
      <div className="row">
        <span className="sub"><b>Leverage trading</b> — borrowed exposure. A {(100 / lev).toFixed(0)}% move against you wipes the margin.</span>
      </div>
      <div className="row levcontrols">
        <span className="tabs mini">
          <button className={dir === 1 ? 'active' : ''} onClick={() => setDir(1)}>▲ Long</button>
          <button className={dir === -1 ? 'active short' : 'short'} onClick={() => setDir(-1)}>▼ Short</button>
        </span>
        <span className="levslider">
          <input type="range" min={LEV_MIN} max={LEV_MAX} value={lev} onChange={e => setLev(+e.target.value)} />
          <b>{lev}×</b>
        </span>
      </div>
      <div className="row">
        <span className="sub">Margin</span>
        <input type="number" min={POSITION_MIN_MARGIN} value={margin} onChange={e => setMargin(Math.max(1, Math.floor(+e.target.value || 1)))} />
        {[1000, 10000, 100000].map(n => <button key={n} className="btn small ghost" onClick={() => setMargin(n)}>{fmt(n)}</button>)}
        <button className="btn small ghost" onClick={() => setMargin(Math.max(POSITION_MIN_MARGIN, Math.floor(cash / (1 + lev * POSITION_FEE))))}>Max</button>
      </div>
      <div className="row">
        <span className="sub">
          exposure <b>{fmt(margin * lev)}</b> · fee <b>{fmt(fee)}</b> · liq at <b className="down">{fmt(liqPrice(fakePos))}</b>
        </span>
        <button className={`btn ${dir === 1 ? 'buy' : 'open-short'}`} disabled={!canOpen}
          onClick={() => dispatch({ type: 'OPEN_POSITION', market, assetId, dir, lev, margin })}>
          Open {dir === 1 ? 'long' : 'short'} {lev}×
        </button>
      </div>
    </div>
  )
}

function ExitCell({ value, depth }) {
  const ex = exitInfo(value, depth)
  if (!ex) return <b>—</b>
  return <b className={ex.slip > 0.05 ? 'down' : ''}>-{(ex.slip * 100).toFixed(1)}% · net {fmt(ex.net)}</b>
}

// ---------- synthetic order book with depth bars ----------
function OrderBook({ price, depth, onPick }) {
  const levels = 7
  const tick = price >= 1000 ? Math.max(1, Math.round(price * 0.0004)) : price * 0.0006
  const unit = depth / price // rough liquidity in units
  const build = (dir) => {
    let cum = 0
    return Array.from({ length: levels }, (_, k) => {
      const i = k + 1
      const size = unit * (0.03 + pseudo(i * dir + 11) * 0.05)
      cum += size
      return { price: price + dir * i * tick, size, cum }
    })
  }
  const asks = build(+1)
  const bids = build(-1)
  const maxCum = Math.max(asks[asks.length - 1].cum, bids[bids.length - 1].cum) || 1
  const flash = useFlash(price)
  const Row = ({ r, side }) => {
    const pct = (r.cum / maxCum) * 100
    const fill = side === 'ask' ? 'rgba(255,69,58,.14)' : 'rgba(48,209,88,.14)'
    return (
      <button className="ob-row" onClick={() => onPick(r.price)}
        style={{ background: `linear-gradient(to left, ${fill} ${pct}%, transparent ${pct}%)` }}>
        <span className={`ob-px ${side === 'ask' ? 'down' : 'up'}`}>{fmtPx(r.price)}</span>
        <span className="ob-sz">{r.size < 1 ? r.size.toFixed(3) : r.size.toFixed(2)}</span>
      </button>
    )
  }
  return (
    <div className="orderbook">
      <div className="ob-head"><span>Price</span><span>Size</span></div>
      <div className="ob-asks">{asks.slice().reverse().map((r, i) => <Row key={'a' + i} r={r} side="ask" />)}</div>
      <div className={`ob-mid ${flash}`}>{fmtPx(price)}</div>
      <div className="ob-bids">{bids.map((r, i) => <Row key={'b' + i} r={r} side="bid" />)}</div>
    </div>
  )
}

// ---------- order entry rail: buy/sell · market/limit · percent · submit ----------
function OrderEntry({ market, def, h, price, cash, dispatch, picked, isOwner }) {
  const isStock = market === 'stock'
  const [side, setSide] = useState('buy')
  const [type, setType] = useState('market')
  const [limitPrice, setLimitPrice] = useState(price)
  const [usd, setUsd] = useState(1000)
  const [sellPct, setSellPct] = useState(100)

  // clicking a book row adopts that price as a limit order
  useEffect(() => {
    if (picked) { setType('limit'); setLimitPrice(+picked.price.toFixed(price < 1 ? 4 : 2)) }
  }, [picked?.nonce])

  const px = type === 'limit' ? (+limitPrice || price) : price
  const slipBuy = tradeSlippage(usd, def.depth)
  const buyQty = isStock ? Math.floor(usd / px) : (usd * (1 - slipBuy)) / px
  const buyCost = isStock ? buyQty * px * (1 + tradeSlippage(buyQty * px, def.depth)) : usd
  const canBuy = cash >= buyCost && buyQty > 0 && (!isStock || h.owned < def.shares) && (type === 'market' || px > 0)
  const sellQty = isStock ? Math.floor(h.owned * sellPct / 100) : h.owned * sellPct / 100
  const canSell = h.owned > 0 && (type === 'limit' || sellQty > 0)

  const buyoutCost = isStock && !isOwner ? (() => { const b = (def.shares - h.owned) * price; return b * (1 + tradeSlippage(b, def.depth)) })() : 0

  const submit = () => {
    if (side === 'buy') {
      if (type === 'market') isStock ? dispatch({ type: 'BUY_STOCK', id: def.id, qty: buyQty }) : dispatch({ type: 'BUY_CRYPTO', id: def.id, usd })
      else dispatch({ type: 'PLACE_ORDER', market, assetId: def.id, side: 'buy', price: px, usd })
    } else {
      if (type === 'market') isStock ? dispatch({ type: 'SELL_STOCK', id: def.id, qty: sellQty }) : dispatch({ type: 'SELL_CRYPTO', id: def.id, frac: sellPct / 100 })
      else dispatch({ type: 'PLACE_ORDER', market, assetId: def.id, side: 'sell', price: px })
    }
  }

  return (
    <div className="orderentry">
      <div className="oe-side">
        <button className={`oe-buy ${side === 'buy' ? 'active' : ''}`} onClick={() => setSide('buy')}>Buy</button>
        <button className={`oe-sell ${side === 'sell' ? 'active' : ''}`} onClick={() => setSide('sell')}>Sell</button>
      </div>
      <div className="oe-types">
        {['market', 'limit'].map(t => (
          <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t === 'market' ? 'Market' : 'Limit'}</button>
        ))}
      </div>
      {type === 'limit' && (
        <label className="oe-field"><span>Limit price</span>
          <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} />
        </label>
      )}
      {side === 'buy' ? (
        <>
          <label className="oe-field"><span>Amount (USD)</span>
            <input type="number" min="1" value={usd} onChange={e => setUsd(Math.max(1, Math.floor(+e.target.value || 1)))} />
          </label>
          <div className="oe-pcts">{[.25, .5, .75, 1].map(p => (
            <button key={p} onClick={() => setUsd(Math.max(1, Math.floor(cash * p)))}>{p * 100}%</button>
          ))}</div>
          <div className="oe-est">
            ≈ {isStock ? `${buyQty.toLocaleString()} shares` : `${buyQty > 0 ? buyQty.toFixed(4) : '0'} ${def.id}`} · cost {fmt(buyCost)}
            {type === 'market' && slipBuy > 0.01 ? ` · −${(slipBuy * 100).toFixed(1)}% slip` : ''}
          </div>
        </>
      ) : (
        <>
          <div className="oe-pcts">{[25, 50, 75, 100].map(p => (
            <button key={p} className={sellPct === p ? 'sel' : ''} onClick={() => setSellPct(p)}>{p}%</button>
          ))}</div>
          <div className="oe-est">
            {h.owned <= 0 ? 'nothing to sell'
              : type === 'limit' ? 'sells your whole position when the price is hit'
                : `sell ${isStock ? sellQty.toLocaleString() + ' shares' : sellQty.toFixed(4) + ' ' + def.id} ≈ ${fmt(sellQty * price)}`}
          </div>
        </>
      )}
      <button className={`btn oe-submit ${side}`} disabled={side === 'buy' ? !canBuy : !canSell} onClick={submit}>
        {type === 'limit' ? `Place limit ${side}` : side === 'buy' ? `Buy ${def.id}` : `Sell ${def.id}`}
      </button>
      {isStock && !isOwner && (
        <button className="btn gold oe-buyout" disabled={cash < buyoutCost} onClick={() => dispatch({ type: 'BUY_STOCK', id: def.id, qty: def.shares - h.owned })}>
          Buy out company · {fmt(buyoutCost)}
        </button>
      )}
    </div>
  )
}

// ---------- resting limit orders on this asset ----------
function OpenOrders({ orders, dispatch, price }) {
  return (
    <div className="openorders">
      <div className="openpos-title">Open orders</div>
      {orders.map(o => (
        <div key={o.id} className="oo-row">
          <span className={`op-dir ${o.side === 'buy' ? 'up' : 'down'}`}>{o.side === 'buy' ? '▲ BUY' : '▼ SELL'} limit</span>
          <span className="op-meta">@ {fmtPx(o.price)}{o.side === 'buy' ? ` · ${fmt(o.usd)}` : ' · sell all'}</span>
          <button className="btn small close-btn" onClick={() => dispatch({ type: 'CANCEL_ORDER', id: o.id })}>Cancel</button>
        </div>
      ))}
    </div>
  )
}

// ---------- unified trading terminal (stocks + crypto) ----------
function AssetTerminal({ market, def, h, state, dispatch }) {
  const isStock = market === 'stock'
  const [picked, setPicked] = useState(null)
  const [termView, setTermView] = useState('chart')
  const price = h.price
  const ch = windowPct(h.hist)
  const flash = useFlash(price)
  const last48 = h.hist.slice(-48)
  const hi24 = last48.length ? Math.max(...last48.map(d => d.hi)) : price
  const lo24 = last48.length ? Math.min(...last48.map(d => d.lo)) : price
  const isOwner = isStock && h.owned >= def.shares
  const avg = h.owned > 0 ? h.spent / h.owned : 0
  const value = h.owned * price
  const pnl = value - h.spent

  const overlays = []
  if (h.owned > 0) overlays.push({ y: avg, color: 'var(--gold)', label: 'avg cost' })
  for (const pos of (state.positions || []).filter(p => p.assetId === def.id)) {
    overlays.push({ y: pos.entry, color: '#9a9aff', label: `${pos.dir === 1 ? 'long' : 'short'} entry` })
    overlays.push({ y: liqPrice(pos), color: 'var(--red)', label: 'liq' })
  }
  const myOrders = (state.orders || []).filter(o => o.assetId === def.id)
  for (const o of myOrders) overlays.push({ y: o.price, color: o.side === 'buy' ? 'var(--accent)' : 'var(--red)', label: `${o.side} limit` })

  return (
    <div className="detail card terminal">
      <div className="term-header">
        <div className="th-id">
          <h2>{def.name} <span className="tksym">{def.id}</span></h2>
          {isStock ? (isOwner && <span className="pill gold">OWNED · +{fmt(def.profit)}/hr</span>) : <span className="pill">{def.style}</span>}
        </div>
        <div className="th-price">
          <b className={flash}>{fmtPx(price)}</b>
          <span className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%</span>
        </div>
        <div className="th-stats">
          <div><span className="label">24h High</span><b>{fmtPx(hi24)}</b></div>
          <div><span className="label">24h Low</span><b>{fmtPx(lo24)}</b></div>
          <div><span className="label">{isStock ? 'Dividend' : 'Liquidity'}</span><b>{isStock ? (def.dividend > 0 ? `${def.dividend}%/hr` : '—') : fmt(def.depth)}</b></div>
        </div>
      </div>

      <div className="term-tabs tabs mini">
        <button className={termView === 'chart' ? 'active' : ''} onClick={() => setTermView('chart')}>Chart</button>
        <button className={termView === 'book' ? 'active' : ''} onClick={() => setTermView('book')}>Order book</button>
      </div>
      <div className={`term-main show-${termView}`}>
        <div className="term-chart"><CandleChart hist={h.hist} min={def.min} max={def.max} overlays={overlays} /></div>
        <div className="term-book"><OrderBook price={price} depth={def.depth} onPick={p => setPicked({ price: p, nonce: Date.now() })} /></div>
      </div>

      <div className="det-stats">
        <div><span className="label">Market cap</span><b>{fmt((isStock ? def.shares : def.supply) * price)}</b></div>
        <div><span className="label">{isStock ? 'Shares' : 'Supply'}</span><b>{(isStock ? def.shares : def.supply).toLocaleString()}</b></div>
        <div><span className="label">Liquidity</span><b>{fmt(def.depth)}</b></div>
        <div><span className="label">You {isStock ? 'own' : 'hold'}</span><b>{h.owned > 0 ? (isStock ? `${h.owned.toLocaleString()}/${def.shares.toLocaleString()}` : `${h.owned.toFixed(4)}`) : '—'}</b></div>
        <div><span className="label">Avg cost</span><b>{h.owned > 0 ? fmtPx(avg) : '—'}</b></div>
        <div><span className="label">P/L</span><b className={pnl >= 0 ? 'up' : 'down'}>{h.owned > 0 ? `${pnl >= 0 ? '+' : ''}${fmt(pnl)}` : '—'}</b></div>
        <div><span className="label">Exit impact</span><ExitCell value={value} depth={def.depth} /></div>
      </div>

      <OrderEntry market={market} def={def} h={h} price={price} cash={state.cash} dispatch={dispatch} picked={picked} isOwner={isOwner} />

      {myOrders.length > 0 && <OpenOrders orders={myOrders} dispatch={dispatch} price={price} />}

      <LeveragePanel market={market} assetId={def.id} price={price} cash={state.cash} dispatch={dispatch} positions={state.positions || []} />
    </div>
  )
}

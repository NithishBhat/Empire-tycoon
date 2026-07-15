import React, { useEffect, useReducer, useRef, useState } from 'react'
import { reducer, initialState, load, save, netWorth, businessIncomes, investmentIncomes } from './game/engine.js'
import { HOURS_PER_SECOND, OFFLINE_CAP_HOURS, ACHIEVEMENTS, START_CASH } from './game/data.js'
import { fmt } from './format.js'
import { startMusic, stopMusic, musicPlaying, getVolume, setVolume, nextTrack, setOnTrackChange } from './music.js'
import Businesses from './components/Businesses.jsx'
import Markets from './components/Markets.jsx'
import Estate from './components/Estate.jsx'
import Empire from './components/Empire.jsx'
import Finances from './components/Finances.jsx'

export { fmt }

// id must stay stable (used by notifications + setTab); label/short/icon are presentation.
const TABS = [
  { id: 'Businesses',      label: 'Businesses',  short: 'Business',  icon: '🏢' },
  { id: 'Stocks & Crypto', label: 'Markets',     short: 'Markets',   icon: '📈' },
  { id: 'Real Estate',     label: 'Real Estate', short: 'Estate',    icon: '🏠' },
  { id: 'Finances',        label: 'Finances',    short: 'Finances',  icon: '📊' },
  { id: 'Empire',          label: 'Empire',      short: 'Empire',    icon: '👑' },
]

// Goal Gradient: progress toward the next net-worth milestone.
// Uses a log scale (so it feels alive across orders of magnitude) with an
// artificial head start — the bar is NEVER at 0%, there is always momentum.
function milestoneProgress(nw) {
  const next = ACHIEVEMENTS.find(a => nw < a.threshold)
  if (!next) return { done: true, pct: 100 }
  const idx = ACHIEVEMENTS.indexOf(next)
  const prev = idx > 0 ? ACHIEVEMENTS[idx - 1].threshold : START_CASH
  const t = (Math.log(Math.max(nw, prev)) - Math.log(prev)) / (Math.log(next.threshold) - Math.log(prev))
  const HEAD_START = 0.08
  const pct = Math.max(HEAD_START, Math.min(1, t)) * 100
  return { done: false, next, pct, remaining: Math.max(0, next.threshold - nw) }
}

// Eases the displayed value toward the real one so money counts up instead of snapping
function AnimatedMoney({ value }) {
  const [disp, setDisp] = useState(value)
  const dispRef = useRef(value)
  dispRef.current = disp
  const rafRef = useRef()
  useEffect(() => {
    const from = dispRef.current
    const begin = performance.now()
    const dur = 700
    cancelAnimationFrame(rafRef.current)
    const step = (t) => {
      const k = Math.min(1, (t - begin) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setDisp(from + (value - from) * eased)
      if (k < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])
  return <>{fmt(disp)}</>
}

// Floating "+$X" particles when passive income lands
function useIncomeParticles(cash) {
  const [parts, setParts] = useState([])
  const prev = useRef(cash)
  const nextId = useRef(0)
  useEffect(() => {
    const delta = cash - prev.current
    prev.current = cash
    if (delta > 0.5) {
      const id = nextId.current++
      setParts(p => [...p.slice(-2), { id, amt: delta }])
      setTimeout(() => setParts(p => p.filter(x => x.id !== id)), 1300)
    }
  }, [cash])
  return parts
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, () => load() || initialState())
  const [tab, setTab] = useState('Businesses')
  const [offline, setOffline] = useState(state.offlineEarned || 0)
  const [offlineH] = useState(state.offlineH || 0)
  // Reciprocity: a brand-new player (no prior save) gets a framed "welcome gift".
  const [welcome, setWelcome] = useState(() => !localStorage.getItem('empire-tycoon-save-v1'))
  const [music, setMusic] = useState(false)
  const [vol, setVol] = useState(getVolume())
  const [track, setTrack] = useState(null)
  const [bellOpen, setBellOpen] = useState(false)

  useEffect(() => { setOnTrackChange(setTrack) }, [])
  const [navTarget, setNavTarget] = useState(null) // { market, assetId, nonce }
  const [toast, setToast] = useState(null)
  const toastSeen = useRef((state.notifications || [])[0]?.id || 0)

  const notifications = state.notifications || []
  const unread = notifications.filter(n => !n.read).length

  // toast the newest notification as it arrives
  useEffect(() => {
    const newest = notifications[0]
    if (newest && newest.id > toastSeen.current) {
      toastSeen.current = newest.id
      setToast(newest)
      const id = setTimeout(() => setToast(null), 6000)
      return () => clearTimeout(id)
    }
  }, [notifications])

  const openNotif = (n) => {
    dispatch({ type: 'READ_NOTIF', id: n.id })
    setToast(null); setBellOpen(false)
    if (n.target) {
      setTab('Stocks & Crypto')
      setNavTarget({ ...n.target, nonce: Date.now() })
    }
  }

  const toggleMusic = () => {
    if (musicPlaying()) { stopMusic(); setMusic(false); localStorage.setItem('empire-music', '0') }
    else { startMusic(); setMusic(true); localStorage.setItem('empire-music', '1') }
  }

  // autoplay policy: if music was on last session, arm it to start on the first click anywhere
  useEffect(() => {
    if (localStorage.getItem('empire-music') !== '1') return
    const arm = () => { if (!musicPlaying()) { startMusic(); setMusic(true) } }
    window.addEventListener('pointerdown', arm, { once: true })
    return () => window.removeEventListener('pointerdown', arm)
  }, [])
  const stateRef = useRef(state)
  stateRef.current = state
  const particles = useIncomeParticles(state.cash)

  const lastTick = useRef(Date.now())
  useEffect(() => {
    // Derive dt from real elapsed time so throttled/backgrounded tabs stay in sync
    // instead of losing income. Clamp to the offline cap for long gaps (sleep, deep throttle).
    const doTick = () => {
      const now = Date.now()
      const dtH = Math.min(OFFLINE_CAP_HOURS, ((now - lastTick.current) / 1000) * HOURS_PER_SECOND)
      lastTick.current = now
      if (dtH > 0) dispatch({ type: 'TICK', dtH })
    }
    const tick = setInterval(doTick, 1000)
    const saver = setInterval(() => save(stateRef.current), 5000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') doTick() // catch up on refocus
      else save(stateRef.current)
    }
    const onHide = () => save(stateRef.current)
    window.addEventListener('beforeunload', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clearInterval(tick); clearInterval(saver); window.removeEventListener('beforeunload', onHide); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  const nw = netWorth(state)
  const biz = businessIncomes(state)
  const inv = investmentIncomes(state)
  const hourly = Object.values(biz).reduce((a, b) => a + b, 0) + inv.dividends + inv.buyouts + inv.rent
  const goal = milestoneProgress(nw)

  return (
    <>
      <header className="topbar">
        <div className="tb-cash">
          <span className="tb-amount">
            <AnimatedMoney value={state.cash} />
            <span className="particles">
              {particles.map(p => <span key={p.id} className="float-plus">+{fmt(p.amt)}</span>)}
            </span>
          </span>
          <span className="tb-sub">
            <span className={hourly >= 0 ? 'up' : 'down'} title="Income per game-hour"><span className="rb-ico">⚡</span>{hourly >= 0 ? '+' : ''}{fmt(hourly)}/hr</span>
            <span className="dot">·</span>
            <span className="gold-t" title="Net worth"><span className="rb-ico">💎</span>{fmt(nw)}</span>
          </span>
        </div>
        <nav className="tabs main-tabs">
          {TABS.map(t => (
            <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="tt-ico">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <div className="tb-actions">
          <button className="icon-btn" onClick={() => setBellOpen(o => !o)} title="Notifications">
            🔔{unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <div className={`music-control ${music ? 'on' : ''}`}>
            <button className="icon-btn" onClick={toggleMusic} title={music ? 'Mute music' : 'Play music'}>
              {music ? (vol === 0 ? '🔈' : '🔊') : '🔇'}
            </button>
            {music && <button className="icon-btn skip-btn" onClick={() => nextTrack()} title="Next track">⏭</button>}
            <input className="vol-slider" type="range" min="0" max="1" step="0.05" value={vol}
              title="Volume"
              onChange={e => { const v = +e.target.value; setVol(v); setVolume(v); if (v > 0 && !musicPlaying()) toggleMusic() }} />
          </div>
        </div>
      </header>
      {bellOpen && (
        <div className="notif-panel">
          <div className="row notif-head">
            <b>Notifications</b>
            <button className="btn small ghost" onClick={() => dispatch({ type: 'READ_ALL_NOTIFS' })}>Mark all read</button>
          </div>
          {notifications.length === 0 && <div className="sub" style={{ padding: '10px 4px' }}>Quiet out there… for now.</div>}
          {notifications.map(n => (
            <button key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => openNotif(n)}>
              <span className="notif-icon">{n.icon}</span>
              <span className="notif-msg">{n.msg}</span>
              {n.target && <span className="chev">›</span>}
            </button>
          ))}
        </div>
      )}
      {toast && (
        <button className="toast" onClick={() => openNotif(toast)}>
          <span className="notif-icon">{toast.icon}</span>
          <span>{toast.msg}</span>
          {toast.target && <span className="sub">tap to trade ›</span>}
        </button>
      )}
      {/* Goal Gradient — always visible, never 0%, one tap to the milestone ladder */}
      <button className="goalstrip" onClick={() => setTab('Empire')} title="View your milestones">
        <span className="goalstrip-lbl">
          {goal.done
            ? <>👑 <b>Every milestone reached</b></>
            : <>Next: <b>{goal.next.icon} {goal.next.name}</b> <span className="gap">· {fmt(goal.remaining)} to go</span></>}
        </span>
        <div className="goalstrip-track"><div className="goalstrip-fill" style={{ width: `${goal.pct}%` }} /></div>
        <span className="goalstrip-pct">{goal.pct.toFixed(0)}%</span>
      </button>

      {welcome && (
        <div className="welcome-gift">
          <span className="wg-emoji">🎁</span>
          <span>Welcome to your empire. We've staked you <b>{fmt(START_CASH)}</b> in seed capital — it's yours to build with. No catch.</span>
          <button className="btn small" onClick={() => setWelcome(false)}>Let's build</button>
        </div>
      )}
      {offline > 0 && (
        <div className="modal-overlay" onClick={() => setOffline(0)}>
          <div className="modal offline-modal" onClick={e => e.stopPropagation()}>
            <div className="om-emoji">💤</div>
            <h2>Welcome back</h2>
            <p className="om-tag">Your empire kept working while you were away.</p>
            <div className="om-earned">+{fmt(offline)}</div>
            <div className="om-breakdown">
              <div>
                <span className="label">Time away</span>
                <b>{offlineH >= 1 ? `${offlineH.toFixed(1)} game-hrs` : `${Math.round(offlineH * 60)} game-min`}</b>
              </div>
              <div>
                <span className="label">Avg rate</span>
                <b>{fmt(offline / Math.max(offlineH, 0.01))}/hr</b>
              </div>
            </div>
            <button className="btn" onClick={() => setOffline(0)}>Collect {fmt(offline)}</button>
          </div>
        </div>
      )}
      {music && track && (
        <div className="nowplaying" onClick={() => nextTrack()} title="Next track">
          <span className="np-eq"><i></i><i></i><i></i></span>
          <span>♪ <b>{track.title}</b> · {track.artist}</span>
          <span className="np-skip">⏭</span>
        </div>
      )}

      {tab === 'Businesses' && <Businesses state={state} dispatch={dispatch} incomes={biz} />}
      {tab === 'Stocks & Crypto' && <Markets state={state} dispatch={dispatch} navTarget={navTarget} />}
      {tab === 'Real Estate' && <Estate state={state} dispatch={dispatch} />}
      {tab === 'Finances' && <Finances state={state} />}
      {tab === 'Empire' && <Empire state={state} dispatch={dispatch} nw={nw} />}

      {/* Mobile bottom navigation — replaces the top tabs under 760px */}
      <nav className="bottomnav">
        {TABS.map(t => (
          <button key={t.id} className={`bn-item ${t.id === tab ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="bn-ind" />
            <span className="bn-ico">{t.icon}</span>
            <span className="bn-label">{t.short}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

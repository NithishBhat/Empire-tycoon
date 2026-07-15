import React from 'react'
import { MERGERS, ACHIEVEMENTS } from '../game/data.js'
import { mergerEligible } from '../game/engine.js'
import { fmt } from '../format.js'

export default function Empire({ state, dispatch, nw }) {
  const next = ACHIEVEMENTS.find(a => !state.achievements[a.id])
  return (
    <>
      <div className="section-title">Business mergers — vertical integration into super-earners</div>
      <div className="grid">
        {MERGERS.map(m => {
          const owned = !!state.mergers[m.id]
          const ok = mergerEligible(state, m.id)
          return (
            <div className="card" key={m.id}>
              <h3>{m.icon} {m.name} {owned && <span className="pill gold">MERGED +{fmt(m.income)}/hr</span>}</h3>
              <div className="sub">{m.reqText}</div>
              {!owned && (
                <div className="row">
                  <span className="money">{fmt(m.capital)} capital</span>
                  <button className="btn gold" disabled={!ok || state.cash < m.capital} onClick={() => dispatch({ type: 'MERGE', id: m.id })}>
                    {ok ? 'Merge' : 'Requirements not met'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="section-title">Achievements</div>
      {next && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <span className="sub">Next up: <b>{next.icon} {next.name}</b> — {next.desc}</span>
            <b className="money gold">{Math.min(100, (nw / next.threshold) * 100).toFixed(1)}%</b>
          </div>
          <div className="bar gold"><div style={{ width: `${Math.max(6, Math.min(100, (nw / next.threshold) * 100))}%` }} /></div>
          {/* Loss-aversion framing: what's still on the line, not just how far you've come */}
          <div className="sub" style={{ color: 'var(--gold)' }}>You're only <b>{fmt(next.threshold - nw)}</b> away — don't stop now.</div>
        </div>
      )}
      <div className="grid">
        {ACHIEVEMENTS.map(a => {
          const earned = !!state.achievements[a.id]
          // Goal gradient on every tier — floored so nothing ever reads a discouraging 0%.
          const pct = earned ? 100 : Math.max(4, Math.min(100, (nw / a.threshold) * 100))
          return (
            <div className={`card insig ${earned ? 'earned' : ''}`} key={a.id}>
              <span className="badge">{a.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{a.name} {earned && <span className="pill gold">✓ unlocked</span>}</h3>
                <div className="sub">{a.desc}</div>
                {!earned && (
                  <>
                    <div className="bar gold" style={{ marginTop: 7 }}><div style={{ width: `${pct}%` }} /></div>
                    <div className="sub" style={{ marginTop: 4 }}>{pct.toFixed(0)}% there</div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="section-title">Profile</div>
      <div className="grid">
        <div className="card">
          <h3>📊 Statistics</h3>
          <div className="row"><span className="sub">Net worth</span><span className="money gold">{fmt(nw)}</span></div>
          <div className="row"><span className="sub">Lifetime business earnings</span><span className="money">{fmt(state.lifetimeBusiness)}</span></div>
          <div className="row"><span className="sub">Time in business</span><span className="money">{Math.floor(state.gameHours)}h</span></div>
          <div className="row">
            <span className="sub">Danger zone</span>
            <button className="btn small sell" onClick={() => { if (confirm('Wipe your empire and start over with $100K?')) dispatch({ type: 'RESET' }) }}>Reset game</button>
          </div>
        </div>
        <div className="card">
          <h3>📜 Event log</h3>
          <div className="log">
            {state.log.length === 0 && <span>Your story starts with $100,000…</span>}
            {state.log.map((e, i) => <span key={i}>{e.msg}</span>)}
          </div>
        </div>
      </div>
    </>
  )
}

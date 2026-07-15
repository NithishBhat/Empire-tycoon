// Generative ambient score v2 — engineered around what music-cognition research
// actually supports for engagement:
//  · no lyrics (verbal content competes with reading/decision-making)
//  · a soft pulse near resting heart rate (~66 BPM half-time feel)
//  · a Shepard-tone riser: endlessly ascending layers that never resolve,
//    sustaining low-grade tension (the film-score "infinite climb" trick)
//  · a chord cycle with occasional deceptive resolutions — dopamine response
//    to music tracks anticipation + prediction error, so mostly-predictable
//    harmony with rare surprises keeps the brain leaning in
// All synthesized live; no audio files, nothing sampled.

let ctx = null
let master = null
let timers = []
let liveNodes = []
let shepard = null

// 0..1 user volume, persisted. Peak master gain at full volume.
const PEAK = 0.28
let volume = (() => {
  const v = parseFloat(localStorage.getItem('empire-music-vol'))
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
})()
export const getVolume = () => volume
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v))
  localStorage.setItem('empire-music-vol', String(volume))
  if (audioEl) audioEl.volume = volume
  if (master && ctx) master.gain.setTargetAtTime(volume * PEAK, ctx.currentTime, 0.1)
}

// ---------- track playlist (with generative fallback) ----------
// Files live in public/music/. Playlist auto-advances; order shuffled each session.
// All tracks are Pixabay Music (Pixabay Content License — free for commercial use).
export const PLAYLIST = [
  { url: '/music/hype-drill.mp3',        title: 'Hype (Drill)',        artist: 'kontraa' },
  { url: '/music/charming-phonk.mp3',    title: 'Charming Phonk',      artist: 'Free Music Lab' },
  { url: '/music/future-beat.mp3',       title: 'Future Beat',         artist: 'kulakovka' },
  { url: '/music/green-sky.mp3',         title: 'Green Sky',           artist: 'dstechnician' },
]
let audioEl = null
let trackIdx = 0
let order = []
export let nowPlaying = null
let onTrackChange = null
export const setOnTrackChange = (fn) => { onTrackChange = fn }

function shuffle(n) {
  const a = [...Array(n).keys()]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

function playIndex(i) {
  if (audioEl) { try { audioEl.pause() } catch {} }
  const track = PLAYLIST[order[i % order.length]]
  const el = new Audio(track.url)
  el.volume = volume
  el.addEventListener('ended', () => { trackIdx = (trackIdx + 1) % order.length; playIndex(trackIdx) })
  el.addEventListener('error', () => { if (audioEl === el) { audioEl = null; nowPlaying = null; startSynth() } })
  el.play().then(() => { audioEl = el; nowPlaying = track; onTrackChange && onTrackChange(track) }).catch(() => {
    if (!audioEl) startSynth()
  })
  setTimeout(() => { if (el.error && !audioEl) startSynth() }, 400)
}

export const musicPlaying = () => !!audioEl || !!ctx

export function startMusic() {
  if (audioEl || ctx) return
  order = shuffle(PLAYLIST.length)
  trackIdx = 0
  playIndex(0)
}

export function nextTrack() {
  if (!audioEl) return
  trackIdx = (trackIdx + 1) % order.length
  playIndex(trackIdx)
}

export function stopMusic() {
  if (audioEl) { try { audioEl.pause(); audioEl.src = '' } catch {}; audioEl = null; nowPlaying = null }
  stopSynth()
}

// A minor world: chord tones (Hz, around octave 2-3)
const CHORDS = {
  Am: [110.0, 130.81, 164.81],
  F:  [87.31, 110.0, 130.81],
  C:  [98.0, 130.81, 164.81],   // C voiced with G on bottom
  G:  [98.0, 123.47, 146.83],
  E:  [82.41, 103.83, 123.47],  // the "surprise" dominant
  Dm: [87.31, 110.0, 146.83],
}
const CYCLE = ['Am', 'F', 'C', 'G']

const synthPlaying = () => !!ctx

function startSynth() {
  if (ctx) return
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * PEAK), ctx.currentTime + 5)
  master.connect(ctx.destination)

  // shared space: feedback delay
  const delay = ctx.createDelay(3)
  delay.delayTime.value = 0.82
  const fb = ctx.createGain(); fb.gain.value = 0.42
  delay.connect(fb); fb.connect(delay)
  const wet = ctx.createGain(); wet.gain.value = 0.45
  delay.connect(wet); wet.connect(master)

  // 1) low drone bed (quiet foundation)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.8
  const droneGain = ctx.createGain(); droneGain.gain.value = 0.14
  lp.connect(droneGain); droneGain.connect(master)
  for (const [freq, type, vol] of [[55, 'sawtooth', 0.18], [55.3, 'sawtooth', 0.18], [110, 'sine', 0.35]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = vol
    o.connect(g); g.connect(lp); o.start()
    liveNodes.push(o)
  }
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.02
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 120
  lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency); lfo.start()
  liveNodes.push(lfo)

  // 2) Shepard riser — 4 sine layers climbing 4 octaves forever, loudest mid-band
  shepard = { voices: [], t0: ctx.currentTime }
  const shepGain = ctx.createGain(); shepGain.gain.value = 0.045
  shepGain.connect(master); shepGain.connect(delay)
  for (let i = 0; i < 4; i++) {
    const o = ctx.createOscillator(); o.type = 'sine'
    const g = ctx.createGain(); g.gain.value = 0
    o.connect(g); g.connect(shepGain); o.start()
    shepard.voices.push({ o, g, offset: i / 4 })
    liveNodes.push(o)
  }
  const CLIMB_S = 36 // one full octave-cycle per voice
  timers.push(setInterval(() => {
    if (!ctx) return
    const t = (ctx.currentTime - shepard.t0) / CLIMB_S
    for (const v of shepard.voices) {
      const p = (t + v.offset) % 1                      // 0..1 position on the 4-octave ladder
      const freq = 55 * Math.pow(2, 4 * p)              // 55 Hz → 880 Hz
      const loud = Math.pow(Math.sin(Math.PI * p), 2)   // fade at the extremes so the wrap is seamless
      v.o.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08)
      v.g.gain.setTargetAtTime(loud, ctx.currentTime, 0.08)
    }
  }, 90))

  // 3) heartbeat pulse — half-time ~66 BPM (one soft thump per 1.82s)
  const thump = () => {
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(52, t)
    o.frequency.exponentialRampToValueAtTime(34, t + 0.35)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 0.6)
  }
  timers.push(setInterval(thump, 1818))

  // 4) anticipation harmony — Am→F→C→G, ~12% deceptive substitution
  let step = 0
  const chord = () => {
    if (!ctx) return
    const t = ctx.currentTime
    let name = CYCLE[step % CYCLE.length]
    if (Math.random() < 0.12) name = Math.random() < 0.5 ? 'E' : 'Dm' // the surprise
    step++
    for (const f of CHORDS[name]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * 2
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.045, t + 2.6)
      g.gain.linearRampToValueAtTime(0, t + 8.2)
      o.connect(g); g.connect(master); g.connect(delay)
      o.start(t); o.stop(t + 8.4)
    }
    // rare high bell answering the chord (sparse, keeps ears interested)
    if (Math.random() < 0.3) {
      const f = CHORDS[name][Math.floor(Math.random() * 3)] * 8
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + 1)
      g.gain.exponentialRampToValueAtTime(0.05, t + 1.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5)
      o.connect(g); g.connect(delay)
      o.start(t + 1); o.stop(t + 4.6)
    }
  }
  chord()
  timers.push(setInterval(chord, 8000))
}

function stopSynth() {
  if (!ctx) return
  for (const id of timers) clearInterval(id)
  timers = []
  const c = ctx, m = master
  ctx = null; master = null; shepard = null
  try {
    m.gain.cancelScheduledValues(c.currentTime)
    m.gain.setValueAtTime(m.gain.value, c.currentTime)
    m.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2)
  } catch {}
  setTimeout(() => { try { for (const n of liveNodes) n.stop() } catch {}; liveNodes = []; c.close().catch(() => {}) }, 1400)
}

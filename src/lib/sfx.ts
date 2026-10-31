import { audioContext } from './speech'

// Soft, synthesized UI sounds (no audio files): short envelopes, gentle pitches, a little room reverb,
// and a slight random detune so repeated taps never sound mechanical. Kept quieter than Suylo's voice.

let enabled = true
export function setSfxEnabled(on: boolean) {
  enabled = on
}

let bus: { out: GainNode; wet: GainNode } | null = null

function impulse(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(2, len, ac.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  return buf
}

function mix() {
  const ac = audioContext()
  if (!bus) {
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    comp.connect(ac.destination)
    const out = ac.createGain()
    out.gain.value = 0.32
    out.connect(comp)
    const reverb = ac.createConvolver()
    reverb.buffer = impulse(ac, 1.3)
    const wet = ac.createGain()
    wet.gain.value = 0.22
    wet.connect(reverb).connect(out)
    bus = { out, wet }
  }
  return { ac, ...bus }
}

const vary = (f: number, amount = 0.04) => f * (1 + (Math.random() * 2 - 1) * amount)

/** One enveloped oscillator, optionally gliding in pitch. */
function tone(opts: {
  type?: OscillatorType
  from: number
  to?: number
  at?: number
  attack?: number
  decay: number
  gain: number
  glide?: number
  reverb?: boolean
}) {
  if (!enabled) return
  const { ac, out, wet } = mix()
  const t = ac.currentTime + (opts.at ?? 0)
  const osc = ac.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.from, t)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.glide ?? opts.decay * 0.6))
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.004))
  g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.attack ?? 0.004) + opts.decay)
  osc.connect(g).connect(out)
  if (opts.reverb) g.connect(wet)
  osc.start(t)
  osc.stop(t + (opts.attack ?? 0.004) + opts.decay + 0.05)
}

/** Filtered noise: clicks, puffs and whooshes. */
function noise(opts: { at?: number; duration: number; gain: number; from: number; to?: number; q?: number; type?: BiquadFilterType }) {
  if (!enabled) return
  const { ac, out } = mix()
  const t = ac.currentTime + (opts.at ?? 0)
  const len = Math.ceil(ac.sampleRate * opts.duration)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const f = ac.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.Q.value = opts.q ?? 1.2
  f.frequency.setValueAtTime(opts.from, t)
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.duration)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain, t + opts.duration * 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration)
  src.connect(f).connect(g).connect(out)
  src.start(t)
}

/** A soft bell: sine plus a quiet octave, ringing into the reverb. */
function bell(freq: number, at = 0, gain = 0.18) {
  tone({ from: freq, at, decay: 0.9, gain, reverb: true })
  tone({ from: freq * 2.01, at, decay: 0.45, gain: gain * 0.25, reverb: true })
}

export const sfx = {
  /** Card tapped: a round, woody pop. */
  pop() {
    const f = vary(660)
    tone({ from: f * 1.35, to: f, decay: 0.12, gain: 0.5, glide: 0.05 })
    tone({ type: 'triangle', from: f * 2, to: f * 1.6, decay: 0.06, gain: 0.08 })
    noise({ duration: 0.025, gain: 0.08, from: 3500, q: 0.8 })
  },
  /** The picture flying up into the sentence strip. */
  whoosh() {
    noise({ duration: 0.38, gain: 0.07, from: 500, to: 2600, q: 0.9 })
  },
  /** Suylo hops with a "!" — a cheerful upward boing. */
  boing() {
    tone({ from: vary(300), to: vary(640), decay: 0.28, gain: 0.32, glide: 0.12 })
    tone({ type: 'triangle', from: 600, to: 1300, decay: 0.12, gain: 0.05, glide: 0.1 })
  },
  /** Category tab. */
  tick() {
    tone({ from: vary(1250, 0.02), decay: 0.05, gain: 0.16 })
  },
  /** Grammar turned a word into its right form. */
  flip() {
    noise({ duration: 0.06, gain: 0.06, from: 2500, q: 2 })
    tone({ from: 1320, decay: 0.12, gain: 0.12, at: 0.03, reverb: true })
    tone({ from: 1980, decay: 0.18, gain: 0.1, at: 0.09, reverb: true })
  },
  /** A word leaves the strip. */
  remove() {
    tone({ from: vary(520), to: 260, decay: 0.12, gain: 0.25, glide: 0.1 })
  },
  /** Sentence spoken — a little major-chord sparkle. */
  celebrate() {
    ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, i * 0.075, 0.13))
  },
  /** Big start button. */
  start() {
    tone({ from: 520, to: 780, decay: 0.18, gain: 0.35, glide: 0.08 })
    ;[784, 1046.5, 1318.5].forEach((f, i) => bell(f, 0.08 + i * 0.06, 0.12))
  },
  /** Suylo lands on a cloud: a soft, low bump scaled by how hard he lands (0..1). */
  land(strength = 1) {
    tone({ from: 160, to: 70, decay: 0.2, gain: 0.35 * strength, glide: 0.15 })
    noise({ duration: 0.12, gain: 0.05 * strength, from: 400, type: 'lowpass' })
  },
  /** The light cord: pull-click. */
  click() {
    noise({ duration: 0.03, gain: 0.25, from: 2200, q: 3 })
    tone({ from: 1800, decay: 0.03, gain: 0.12 })
    tone({ from: 120, to: 80, decay: 0.06, gain: 0.25 })
    noise({ at: 0.09, duration: 0.025, gain: 0.18, from: 3000, q: 3 })
  },
  /** Light floods the screen: a rising shimmer. */
  shimmer() {
    noise({ duration: 0.7, gain: 0.05, from: 1500, to: 6000, q: 0.7 })
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone({ from: f, at: 0.05 + i * 0.07, attack: 0.08, decay: 1.1, gain: 0.07, reverb: true }))
  },
}

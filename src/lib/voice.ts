// How Suylo sounds: faster or slower, and deeper or higher — set by parents in Settings.
//
// Speed and pitch change separately. A clip is first stretched in time (WSOLA: overlapping slices of the
// sound are laid out further apart or closer together, each one nudged to where it lines up best with the
// last, so the voice stays smooth) and then played faster or slower, which moves the pitch:
//   stretch by pitch / speed, play at rate = pitch  →  pitch × pitch, length ÷ speed.
// Everything happens in the browser on Suylo's own clips, so it works offline.

export interface Voice {
  /** 1 = normal; 0.6 slow … 1.6 fast */
  speed: number
  /** 1 = normal; 0.65 deep … 1.6 high */
  pitch: number
}

let voice: Voice = { speed: 1, pitch: 1 }
const shaped = new WeakMap<AudioBuffer, Map<string, AudioBuffer>>()

export function setVoice(next: Voice) {
  voice = next
}

export const getVoice = () => voice

const isNormal = (v: Voice) => Math.abs(v.speed - 1) < 0.01 && Math.abs(v.pitch - 1) < 0.01

/** The buffer to play and the rate to play it at, for the current voice. */
export function shape(ctx: BaseAudioContext, buffer: AudioBuffer): { buffer: AudioBuffer; rate: number } {
  if (isNormal(voice)) return { buffer, rate: 1 }
  const key = `${voice.speed.toFixed(2)}:${voice.pitch.toFixed(2)}`
  let byVoice = shaped.get(buffer)
  if (!byVoice) shaped.set(buffer, (byVoice = new Map()))
  let out = byVoice.get(key)
  if (!out) {
    const factor = voice.pitch / voice.speed
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
    const stretched = stretch(channels, factor, buffer.sampleRate)
    out = ctx.createBuffer(stretched.length, stretched[0].length, buffer.sampleRate)
    stretched.forEach((data, c) => out!.copyToChannel(data, c))
    byVoice.set(key, out)
  }
  return { buffer: out, rate: voice.pitch }
}

/** Makes the sound `factor` times longer without changing its pitch (WSOLA). */
function stretch(channels: Float32Array<ArrayBuffer>[], factor: number, sampleRate: number): Float32Array<ArrayBuffer>[] {
  if (Math.abs(factor - 1) < 0.01) return channels
  const input = channels[0]
  const frame = Math.round(sampleRate * 0.03) & ~1 // 30 ms slices
  const hopOut = frame / 2
  const hopIn = hopOut / factor
  const tolerance = Math.round(sampleRate * 0.008)
  const window = Float32Array.from({ length: frame }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame))
  const outLength = Math.ceil(input.length * factor) + frame
  const out = channels.map(() => new Float32Array(outLength))
  const weight = new Float32Array(outLength)

  let previous = 0
  for (let k = 0; ; k++) {
    const nominal = Math.round(k * hopIn)
    if (nominal + frame + tolerance >= input.length) break
    // the slice that lines up best with the natural continuation of the previous one
    let best = nominal
    if (k > 0) {
      const target = previous + hopOut
      let bestScore = -Infinity
      for (let d = -tolerance; d <= tolerance; d += 2) {
        const start = nominal + d
        if (start < 0) continue
        let score = 0
        for (let i = 0; i < hopOut; i += 2) score += input[start + i] * input[target + i]
        if (score > bestScore) {
          bestScore = score
          best = start
        }
      }
    }
    const at = k * hopOut
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c]
      const dst = out[c]
      for (let i = 0; i < frame; i++) dst[at + i] += src[best + i] * window[i]
    }
    for (let i = 0; i < frame; i++) weight[at + i] += window[i]
    previous = best
  }
  const length = Math.min(outLength, Math.ceil(input.length * factor))
  return out.map((dst) => {
    for (let i = 0; i < length; i++) if (weight[i] > 1e-3) dst[i] /= weight[i]
    return dst.slice(0, length)
  })
}

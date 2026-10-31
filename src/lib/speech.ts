import type { Mood } from '../types'
import { getVoice, shape } from './voice'
import { spokenKey } from './sentenceKey'
import recorded from '../data/sentences.json'

// Sentences pre-recorded in Suylo's AI voice (scripts/gen_sentences.py): smooth on any device, offline too.
const RECORDED = recorded as unknown as Record<string, [name: string, starts: number[], offline?: boolean]>
const sentenceUrl = (name: string) => `${import.meta.env.BASE_URL}sentences/${name}.mp3`
/** The main deck's pre-recorded sentences, saved on the device for offline use (big-dictionary ones are fetched when said). */
export const recordedSentenceUrls = () => Object.values(RECORDED).filter(([, , offline]) => offline !== false).map(([name]) => sentenceUrl(name))

// Plays Suylo's voice through Web Audio so the mascot can read the loudness and move its mouth.
//
// A sentence is spoken in one of three ways, best first:
// 1. AI voice online — the whole sentence is synthesized at once, with real sentence intonation
//    (needs the local/hosted Suylo voice server, see scripts/tts_server.py).
// 2. Offline clips — every word has a mid-sentence take (continuing tone) and a final take (falling
//    tone); they are scheduled back-to-back on the audio clock so the sentence flows.
// 3. The device's own voice, only for cards that have no recording at all.

export interface Utterance {
  text: string
  audio?: string
  /** The same word recorded mid-sentence; used for every word except the last. */
  audioMid?: string
  /** Spelling the AI voice should read (e.g. печение for «печенье»). */
  say?: string
  /** True when the clip is Suylo's own voice (not a parent recording), so the AI may re-voice it. */
  suylo?: boolean
  /** Punctuation after the word: a short pause («Апа, …») or the end of a sentence. */
  punct?: ',' | '.' | '?'
  /** A word the child built with мүчөлөр, said offline from pieces: «алма» + «га». */
  parts?: { audio?: string; audioMid?: string }[]
}

export interface SpeechState {
  speaking: boolean
  mood: Mood | null
  /** Index into the utterance list currently being spoken, for highlighting the sentence strip. */
  index: number
}

type Listener = (state: SpeechState) => void

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let sources: AudioBufferSourceNode[] = []
let timers: number[] = []
let runId = 0
let synthLevel = 0
const buffers = new Map<string, Promise<AudioBuffer>>()
const listeners = new Set<Listener>()
let state: SpeechState = { speaking: false, mood: null, index: -1 }
const levelData = new Uint8Array(512)

function setState(next: Partial<SpeechState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l(state))
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  listener(state)
  return () => void listeners.delete(listener)
}

export function audioContext() {
  if (!ctx) {
    // iPhone: play like a media app, so Suylo still talks when the ring/silent switch is on silent.
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
      if (session) session.type = 'playback'
    } catch {
      // older Safari
    }
    ctx = new AudioContext()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.connect(ctx.destination)
  }
  // Mobile browsers start the context suspended until a tap, and iPhone pauses it ('interrupted') after
  // the screen locks, a call or another app's sound.
  if (ctx.state !== 'running') void ctx.resume().catch(() => {})
  return ctx
}

/** Waits (briefly) for the audio clock to run, so scheduled sound is not stuck on a paused context. */
async function running(ac: AudioContext) {
  if (ac.state === 'running') return
  await Promise.race([ac.resume().catch(() => {}), pause(800)])
}

/** Call from the first user gesture so iOS lets us play sound. */
export function unlockAudio() {
  audioContext()
}

function decode(data: ArrayBuffer) {
  return audioContext().decodeAudioData(data)
}

/**
 * Clips keep a little silence at each end, and Safari (iPhone) adds its own MP3 padding on top — so a sentence
 * sounded word by word there. Cut it to 10 ms before the first sound and 70 ms after the last (quiet final
 * consonants like the «т» in «сүт» stay), so the words of a sentence run together on every device.
 */
function trimSilence(buffer: AudioBuffer): AudioBuffer {
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  const level = 0.015 * peak
  let start = 0
  while (start < data.length && Math.abs(data[start]) < level) start++
  let end = data.length - 1
  while (end > start && Math.abs(data[end]) < level) end--
  start = Math.max(0, start - Math.round(0.01 * buffer.sampleRate))
  end = Math.min(data.length, end + Math.round(0.07 * buffer.sampleRate))
  if (start === 0 && end >= data.length - 1) return buffer
  const out = audioContext().createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).slice(start, end), c)
  return out
}

// Downloads Suylo needs right now (a sentence, a word). While any is running, the background offline saving
// (lib/offline.ts) waits, so on a slow connection the voice the child asked for is not stuck behind it.
let urgent = 0
export const speechBusy = () => urgent > 0
function track<T>(p: Promise<T>) {
  urgent++
  p.then(
    () => urgent--,
    () => urgent--,
  )
  return p
}

/**
 * Every word and sentence at the same loudness: the clips differ by up to ~7 dB («эмне» is much louder than
 * «кубанычтуумун»), which a child hears as some words shouting. Scaled to one speech level (RMS of the voiced part),
 * never past the point where the loudest sample would clip.
 */
const TARGET_RMS = 0.26
function level(buffer: AudioBuffer): AudioBuffer {
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  if (!peak) return buffer
  let sum = 0
  let n = 0
  for (let i = 0; i < data.length; i++)
    if (Math.abs(data[i]) > 0.02 * peak) {
      sum += data[i] * data[i]
      n++
    }
  const gain = Math.min(TARGET_RMS / Math.sqrt(sum / Math.max(1, n)), 0.98 / peak)
  if (Math.abs(gain - 1) < 0.05) return buffer
  const out = audioContext().createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const from = buffer.getChannelData(c)
    const to = out.getChannelData(c)
    for (let i = 0; i < from.length; i++) to[i] = from[i] * gain
  }
  return out
}

/** A clip or recording that has not arrived by then is given up (on a stuck connection it could arrive minutes later). */
const LOAD_TIMEOUT = 8000

const raw = new Map<string, Promise<AudioBuffer>>()
/** A recording as it is (a whole sentence: its word timings must not shift). */
function loadRaw(url: string) {
  let p = raw.get(url)
  if (!p) {
    p = track(fetch(url, { signal: AbortSignal.timeout(LOAD_TIMEOUT) }))
      .then((r) => {
        if (!r.ok) throw new Error(`audio ${r.status}`)
        return r.arrayBuffer()
      })
      .then(decode)
      .then(level)
    p.catch(() => raw.delete(url))
    raw.set(url, p)
  }
  return p
}

function loadBuffer(url: string) {
  let p = buffers.get(url)
  if (!p) {
    p = track(fetch(url, { signal: AbortSignal.timeout(LOAD_TIMEOUT) }))
      .then((r) => {
        if (!r.ok) throw new Error(`audio ${r.status}`)
        return r.arrayBuffer()
      })
      .then(decode)
      .then(trimSilence)
      .then(level)
    p.catch(() => buffers.delete(url))
    buffers.set(url, p)
  }
  return p
}

export function preload(urls: (string | undefined)[]) {
  for (const url of urls) if (url) void loadBuffer(url).catch(() => {})
}

/** 0..1 loudness of whatever is playing right now. */
export function getLevel() {
  if (!state.speaking) return 0
  if (analyser && sources.length) {
    analyser.getByteTimeDomainData(levelData)
    let sum = 0
    for (const v of levelData) sum += (v - 128) * (v - 128)
    return Math.min(1, (Math.sqrt(sum / levelData.length) / 128) * 4)
  }
  return synthLevel
}

// ---------------------------------------------------------------- AI voice (online)

// Where Suylo's AI voice can be reached, tried in order:
//   • this computer (`npm run ai`);
//   • the laptop this page came from over the same Wi-Fi (http://192.168.…:5173);
//   • a public address for it, if the site is built with VITE_SUYLO_AI_URL.
// When none answers, the pre-recorded sentences and word clips are used.
// (The public https site never asks the visitor's own computer or network: Chrome would show a permission pop-up.)
const local = typeof location !== 'undefined' && location.protocol === 'http:'
const AI_PLACES: string[] = local
  ? ['http://localhost:8765', ...(location.hostname !== 'localhost' ? [`http://${location.hostname}:8765`] : [])]
  : import.meta.env.VITE_SUYLO_AI_URL
    ? [import.meta.env.VITE_SUYLO_AI_URL as string]
    : []
let AI_URL = AI_PLACES[0] ?? ''
let aiOnline = false
const aiListeners = new Set<(online: boolean) => void>()
const aiCache = new Map<string, Promise<{ buffer: AudioBuffer; starts: number[] }>>()

export async function checkAi() {
  let ok = false
  for (const place of AI_PLACES) {
    try {
      const r = await fetch(`${place}/health`, { signal: AbortSignal.timeout(place.startsWith('https') ? 4000 : 900) })
      if (r.ok && navigator.onLine !== false) {
        AI_URL = place
        ok = true
        break
      }
    } catch {
      // not there — try the next place
    }
  }
  if (ok !== aiOnline) {
    aiOnline = ok
    aiListeners.forEach((l) => l(ok))
  }
  return ok
}

export function subscribeAi(listener: (online: boolean) => void) {
  aiListeners.add(listener)
  listener(aiOnline)
  return () => void aiListeners.delete(listener)
}

if (typeof window !== 'undefined') {
  void checkAi()
  window.setInterval(() => void checkAi(), 20000)
  window.addEventListener('online', () => void checkAi())
  window.addEventListener('offline', () => void checkAi())
}

/** A word in Suylo's AI voice, to keep on the device for a parent's new card (null when the AI is not reachable). */
export async function aiClip(text: string): Promise<Blob | null> {
  if (!aiOnline || !text.trim()) return null
  try {
    const r = await fetch(`${AI_URL}/speak?text=${encodeURIComponent(text.toLowerCase().trim())}`, { signal: AbortSignal.timeout(8000) })
    return r.ok ? await r.blob() : null
  } catch {
    return null
  }
}

function aiSentence(text: string) {
  let p = aiCache.get(text)
  if (!p) {
    p = track(fetch(`${AI_URL}/speak?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) })).then(
      async (r) => {
        if (!r.ok) throw new Error(`ai ${r.status}`)
        const starts = JSON.parse(r.headers.get('X-Word-Starts') ?? '[]') as number[]
        return { buffer: level(await decode(await r.arrayBuffer())), starts }
      },
    )
    p.catch(() => aiCache.delete(text))
    aiCache.set(text, p)
  }
  return p
}

// ---------------------------------------------------------------- playback

/**
 * Plays buffers back-to-back on the audio clock. `gaps[i]` is the pause after part i (negative = a
 * slight overlap so words join); `wordStarts` (seconds) moves the strip highlight for one AI clip.
 */
async function schedule(parts: AudioBuffer[], id: number, gaps: number[] = [], wordStarts?: number[], itemOf?: number[]) {
  const ac = audioContext()
  await running(ac)
  return new Promise<void>((resolve) => {
    // Too late: the child pressed Suylo long ago and has moved on — speaking now would come out of nowhere.
    if (id !== runId || performance.now() > deadline) return resolve()
    begin()
    // Suylo's voice as the parents set it: faster/slower, deeper/higher (lib/voice.ts). Pauses follow the speed.
    const { speed } = getVoice()
    let t = ac.currentTime + 0.04
    const t0 = t
    parts.forEach((part, i) => {
      const { buffer, rate } = shape(ac, part)
      const src = ac.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate
      src.connect(analyser!)
      src.start(t)
      sources.push(src)
      if (!wordStarts) timers.push(window.setTimeout(() => id === runId && setState({ index: itemOf?.[i] ?? i }), (t - ac.currentTime) * 1000))
      if (i === parts.length - 1) src.onended = () => resolve()
      t += buffer.duration / rate + (i < parts.length - 1 ? (gaps[i] ?? 0) / speed : 0)
    })
    wordStarts?.forEach((s, i) =>
      timers.push(window.setTimeout(() => id === runId && setState({ index: i }), (t0 + s / speed - ac.currentTime) * 1000)),
    )
    // If the browser never reports the end (a paused audio clock), Suylo must not keep dancing in silence.
    timers.push(window.setTimeout(resolve, (t - ac.currentTime) * 1000 + 700))
  })
}

let kyVoice: SpeechSynthesisVoice | null | undefined
function pickVoice() {
  if (kyVoice !== undefined) return kyVoice
  const voices = speechSynthesis.getVoices()
  if (!voices.length) return null
  kyVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith('ky')) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('kk')) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('ru')) ??
    null
  return kyVoice
}

// Last resort when a card has no recording yet: the device's own voice.
function speakWithDevice(text: string, id: number) {
  return new Promise<void>((resolve) => {
    if (id !== runId || !('speechSynthesis' in window) || performance.now() > deadline) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'ky-KG'
    u.rate = 0.9 * getVoice().speed
    u.pitch = Math.min(2, Math.max(0.1, getVoice().pitch))
    begin()
    const wobble = setInterval(() => (synthLevel = 0.3 + Math.random() * 0.5), 90)
    const done = () => {
      clearInterval(wobble)
      synthLevel = 0
      resolve()
    }
    u.onend = done
    u.onerror = done
    speechSynthesis.speak(u)
    // Some engines never fire onend for unsupported text.
    setTimeout(done, 1500 + text.length * 120)
  })
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Suylo moves only while there is sound: not while a recording is still loading.
let pendingMood: Mood | null = null
/** Speech must start by this time (performance.now()), or it is not started at all. */
let deadline = 0
const MAX_WAIT = 7000
function begin() {
  if (!state.speaking) setState({ speaking: true, mood: pendingMood })
}

export function stop() {
  runId++
  for (const src of sources) {
    try {
      src.stop()
    } catch {
      // not started yet / already stopped
    }
  }
  sources = []
  timers.forEach(clearTimeout)
  timers = []
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  setState({ speaking: false, index: -1 })
}

/** How long a tap on Suylo waits for the AI voice (the natural intonation) before the word clips speak instead. */
const AI_PATIENCE = 4000

const wordsOf = (items: Utterance[]) => items.map((i) => `${(i.say ?? i.text).toLowerCase().trim()}${i.punct ?? ''}`.split(/\s+/))

/**
 * Called while the child builds a sentence: the AI starts voicing it in the background, so a tap on
 * Suylo plays it at once. Pre-recorded sentences and parents' own recordings need nothing.
 */
export function prepare(items: Utterance[]) {
  if (items.length < 2 || !items.every((i) => i.suylo || !i.audio)) return
  const ready = RECORDED[spokenKey(items)]
  if (ready) void loadRaw(sentenceUrl(ready[0])).catch(() => {})
  else if (aiOnline) prepareAi(wordsOf(items).flat().join(' '))
}

// The voice server makes one sentence at a time: while it works, only the newest sentence waits its turn
// (not every half-built one the child tapped on the way).
let preparing = false
let preparingNext: string | null = null
function prepareAi(text: string) {
  if (preparing) {
    preparingNext = text
    return
  }
  preparing = true
  void aiSentence(text)
    .catch(() => {})
    .finally(() => {
      preparing = false
      const next = preparingNext
      preparingNext = null
      if (next) prepareAi(next)
    })
}

type Take = { buffer: AudioBuffer; starts: number[] }
/** The first take that arrives; undefined if all fail, null if none comes in time. */
function first(takes: Promise<Take | undefined>[], ms: number) {
  return new Promise<Take | null | undefined>((resolve) => {
    let left = takes.length
    if (!left) return resolve(undefined)
    takes.forEach((t) => t.then((got) => (got ? resolve(got) : --left || resolve(undefined))))
    setTimeout(() => resolve(null), ms)
  })
}

/** Speaks the utterances as one sentence. A new call interrupts the previous one. */
export async function speak(items: Utterance[], mood: Mood | null = null) {
  stop()
  const id = runId
  if (!items.length) return
  audioContext()
  pendingMood = mood
  deadline = performance.now() + MAX_WAIT
  setState({ mood, index: 0 })
  const finish = () => {
    if (id !== runId) return
    sources = []
    setState({ speaking: false, index: -1 })
  }

  // The AI voice times each word; a card like «ичким келип жатат» starts at its first word.
  const words = wordsOf(items)
  const byCard = (starts: number[]) => {
    let w = 0
    return words.map((ws) => {
      const at = starts[w] ?? 0
      w += ws.length
      return at
    })
  }
  const suyloVoice = items.every((i) => i.suylo || !i.audio) // a parent's own recording keeps their voice

  // 1. A sentence Suylo has pre-recorded in its AI voice: natural intonation on any device, offline too.
  //    (Usually loaded already: prepare() fetches it while the child taps.)
  const ready = items.length > 1 && suyloVoice ? RECORDED[spokenKey(items)] : undefined
  const recording = ready
    ? loadRaw(sentenceUrl(ready[0])).then(
        (buffer): Take => ({ buffer, starts: ready[1] }),
        () => undefined,
      )
    : undefined
  const useAi = aiOnline && (items.length > 1 || !items[0].audio) && suyloVoice
  if (recording) {
    // If the recording is slow to arrive (bad connection), the live AI voice may win the race below.
    const got = await first([recording], useAi ? 1500 : LOAD_TIMEOUT)
    if (id !== runId) return
    if (got) {
      await schedule([got.buffer], id, [], byCard(got.starts))
      return finish()
    }
  }

  // 3. (prepared here) Offline: mid-sentence takes, and the falling final take before every pause and at the end;
  //    words join without gaps, commas get a short breath, sentences a longer one.
  //    A word built with мүчөлөр is its pieces back to back («алма» + «га»).
  const ends = (i: number) => i === items.length - 1 || !!items[i].punct
  const join = items.every((i) => i.suylo) ? -0.03 : 0.12
  const clips: { url?: string; item: number; gap: number }[] = []
  items.forEach((it, i) => {
    const pieces = it.parts ?? [{ audio: it.audio, audioMid: it.audioMid }]
    pieces.forEach((piece, j) => {
      const last = j === pieces.length - 1
      clips.push({
        url: last && ends(i) ? piece.audio : (piece.audioMid ?? piece.audio),
        item: i,
        gap: !last ? -0.05 : it.punct === ',' ? 0.2 : it.punct ? 0.42 : join,
      })
    })
  })
  const haveClips = clips.every((c) => c.url)

  // 2. Online: the AI voices the whole sentence with natural intonation (also words with no clip yet, like a
  //    parent's new card). Usually it is ready already (prepare() asks for it while the child taps). If it is
  //    slow, the child is not kept waiting: the clips speak now and the AI take is kept for next time.
  if (useAi) {
    const ai = aiSentence(words.flat().join(' ')).catch(() => undefined)
    const got = await first(recording ? [ai, recording] : [ai], haveClips ? AI_PATIENCE : MAX_WAIT - 1000)
    if (id !== runId) return
    if (got) {
      await schedule([got.buffer], id, [], byCard(got.starts))
      return finish()
    }
    if (got === undefined) void checkAi()
  }

  if (haveClips) {
    try {
      const parts = await Promise.all(clips.map((c) => loadBuffer(c.url!)))
      if (id !== runId) return
      await schedule(parts, id, clips.map((c) => c.gap), undefined, clips.map((c) => c.item))
      return finish()
    } catch {
      // a clip failed to load — fall back word by word
    }
  }

  // 4. Word by word, using the device voice where there is no clip.
  for (let i = 0; i < items.length; i++) {
    if (id !== runId) return
    setState({ index: i })
    const { audio, text } = items[i]
    let played = false
    if (audio) {
      try {
        await schedule([await loadBuffer(audio)], id)
        played = true
      } catch {
        // fall through to the device voice
      }
    }
    if (!played) await speakWithDevice(text, id)
    if (i < items.length - 1) await pause(120)
  }
  finish()
}

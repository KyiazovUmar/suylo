import audioManifest from '../data/audio.json'
import { touchedRecently } from './pointer'
import { recordedSentenceUrls, speechBusy } from './speech'

// Suylo's pictures, voice clips and pre-recorded sentences for offline use. The app itself (code, fonts) is
// saved by the service worker in one small step; these ~4,000 files are saved here, a few at a time and
// retried on a bad connection — so one dropped download never throws the whole offline copy away. The service
// worker answers /cards/ and /audio/ from these same caches (see vite.config.ts).

declare const __SUYLO_PICTURES__: string[]

export const AUDIO_CACHE = 'suylo-audio'
const PICTURE_CACHE = 'suylo-pictures'
const BASE = import.meta.env.BASE_URL
// Pictures first (the board needs them), then the word clips, then the sentences.
const files: { url: string; cache: string }[] = [
  ...__SUYLO_PICTURES__.map((f) => ({ url: `${BASE}cards/${f}`, cache: PICTURE_CACHE })),
  ...audioManifest.ids.map((id) => ({ url: `${BASE}audio/${id}.${audioManifest.ext}`, cache: AUDIO_CACHE })),
  ...recordedSentenceUrls().map((url) => ({ url, cache: AUDIO_CACHE })),
]

type Listener = (done: number, total: number) => void
const listeners = new Set<Listener>()
let progress = { done: 0, total: files.length }
let started = false

export function subscribeVoices(listener: Listener) {
  listeners.add(listener)
  listener(progress.done, progress.total)
  return () => void listeners.delete(listener)
}

/**
 * Saves every picture and voice clip that is not saved yet. Safe to call on every start; it only fetches what is
 * missing. Only files really saved count, so "ready" is never shown with gaps; missing ones are tried again later.
 */
export async function saveVoicesOffline() {
  if (started || !('caches' in window)) return
  started = true
  const opened = new Map<string, Cache>()
  const cacheFor = async (name: string) => opened.get(name) ?? opened.set(name, await caches.open(name)).get(name)!
  let next = 0
  let saved = 0
  let failed = 0
  const report = () => listeners.forEach((l) => l(progress.done, progress.total))
  const worker = async () => {
    while (next < files.length) {
      const { url, cache: name } = files[next++]
      const cache = await cacheFor(name)
      let ok = !!(await cache.match(url))
      for (let attempt = 0; !ok && attempt < 4; attempt++) {
        // Step aside while Suylo is fetching something to say, or the child is tapping.
        while (speechBusy() || touchedRecently()) await new Promise((r) => setTimeout(r, 200))
        try {
          const res = await fetch(url, { cache: 'no-cache' })
          if (res.ok) {
            await cache.put(url, res)
            ok = true
          }
        } catch {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1))) // a moment, then again
        }
      }
      if (ok) {
        saved++
        progress = { ...progress, done: saved }
        report()
      } else failed++
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker))
  // Some files could not be saved (connection lost): try again in a while, or as soon as the internet is back.
  if (failed) {
    started = false
    window.setTimeout(() => void saveVoicesOffline(), 30000)
  }
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void saveVoicesOffline())

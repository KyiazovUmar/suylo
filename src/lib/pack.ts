// The optional big dictionary (≈950 extra words). It is not part of the app download: parents
// install it from Settings, which stores every picture and voice clip in the browser's cache so
// the words keep working offline. The service worker serves /pack/ from that same cache.

const BASE = import.meta.env.BASE_URL
export const PACK_CACHE = 'suylo-pack'
/** Version 4 gave every word a picture; 3 put the words into the main topics; 2 added word kinds and endings. An older install updates itself. */
export const PACK_VERSION = 4
const PACK_JSON = `${BASE}pack/pack.json`

export interface PackCard {
  id: string
  label: string
  type: string
  image: boolean
  subject?: string
  consume?: string
  kind?: string
  takes?: string
  obj?: string
  bare?: string
  use?: string
  personAlt?: string
  who?: string
  describes?: string[]
  stem?: string
  pers?: string
  owner?: string
  say?: string
  frame?: string
  role?: string
  alt?: string
  person?: string
  forms?: Record<string, string>
}

export interface PackCategory {
  id: string
  label: string
  /** A main topic these words join («food»), or none for a topic of its own. */
  into?: string
  cards: PackCard[]
}

export interface Pack {
  version: number
  words: number
  bytes: number
  categories: PackCategory[]
}

export const packImage = (id: string) => `${BASE}pack/img/${id}.png`
export const packAudio = (id: string, mid = false) => `${BASE}pack/audio/${id}${mid ? '--mid' : ''}.mp3`

/** Size and word count, to show parents before they download. */
export async function packInfo(): Promise<Pack | null> {
  try {
    const r = await fetch(PACK_JSON, { cache: 'no-cache' })
    return r.ok ? ((await r.json()) as Pack) : null
  } catch {
    return null
  }
}

/** Reads the installed pack from the cache (works offline). */
export async function loadPack(): Promise<Pack | null> {
  try {
    const cache = await caches.open(PACK_CACHE)
    const r = (await cache.match(PACK_JSON)) ?? (await fetch(PACK_JSON))
    return r.ok ? ((await r.json()) as Pack) : null
  } catch {
    return null
  }
}

export async function installPack(onProgress: (done: number, total: number) => void): Promise<Pack> {
  const r = await fetch(PACK_JSON, { cache: 'no-cache' })
  if (!r.ok) throw new Error('pack.json')
  const pack = (await r.clone().json()) as Pack
  const cache = await caches.open(PACK_CACHE)
  const urls: string[] = []
  for (const cat of pack.categories) {
    if (!cat.into) urls.push(packImage(`cat-${cat.id}`))
    for (const card of cat.cards) {
      if (card.image) urls.push(packImage(card.id))
      for (const id of [card.id, ...Object.keys(card.forms ?? {}).map((form) => `${card.id}--${form}`)])
        urls.push(packAudio(id), packAudio(id, true))
    }
  }
  let done = 0
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]
      if (!(await cache.match(url))) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url)
            if (res.ok) {
              await cache.put(url, res)
              break
            }
          } catch {
            // retry
          }
        }
      }
      onProgress(++done, urls.length)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  // pack.json last: its presence in the cache means "fully installed".
  await cache.put(PACK_JSON, r)
  return pack
}

export async function removePack() {
  await caches.delete(PACK_CACHE)
}

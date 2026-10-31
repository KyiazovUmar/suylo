import vocab from '../data/vocab.json'
import boardData from '../data/board.json'
import audioManifest from '../data/audio.json'
import { packAudio, packImage, type Pack, type PackCategory } from './pack'
import type { Board, BoardSlots, Card, CardRecord, Category, CategoryRecord, Consume, Frame, Kind, Mood, PersonCase, Role, SubjectCase, WordForm, WordType } from '../types'

const BASE = import.meta.env.BASE_URL
const builtinAudio = new Set<string>(audioManifest.ids)

interface VocabCard {
  id: string
  label: string
  img?: string
  type: string
  mood?: string
  subject?: string
  forms?: Partial<Record<string, string>>
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
  base?: string
  auto?: string
  suffix?: string
  pers?: string
  owner?: string
  say?: string
  frame?: string
  role?: string
  alt?: string
  person?: string
}

// Object URLs are tied to the Blob instance, so each stored image/recording gets exactly one.
const blobUrls = new WeakMap<Blob, string>()
export function blobUrl(blob: Blob) {
  let url = blobUrls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    blobUrls.set(blob, url)
  }
  return url
}

export const builtinImage = (cardId: string) => `${BASE}cards/${cardId}.png`
export const builtinAudioUrl = (cardId: string) =>
  builtinAudio.has(cardId) ? `${BASE}audio/${cardId}.${audioManifest.ext}` : undefined

export const PLACEHOLDER_IMAGE = `${BASE}card-placeholder.svg`

const helperWord = (id: string, label: string): Card => ({
  id,
  categoryId: '_grammar',
  label,
  type: 'social',
  image: '',
  audio: builtinAudioUrl(id),
  audioMid: builtinAudioUrl(`${id}--mid`),
  audioSource: 'suylo',
  builtin: true,
  hidden: true,
})

/** «жана» ("and"), added by the grammar between things and between clauses. */
export const AND_CARD = helperWord('_and', 'жана')
/** «менен» ("with"), after things played with: «оюнчук менен ойногум келип жатат». */
export const WITH_CARD = helperWord('_with', 'менен')

/** Suylo's clip of a word part with no card of its own, e.g. the ending «га» (id «_sfx-га»). */
export const helperClip = (id: string): WordForm | undefined => {
  const audio = builtinAudioUrl(id)
  return audio ? { label: '', audio, audioMid: builtinAudioUrl(`${id}--mid`) ?? audio } : undefined
}

interface Media {
  image: string
  audio?: string
  audioMid?: string
  /** Clip of a grammatical form, e.g. «менин» or «базарга». */
  form: (form: string, mid?: boolean) => string | undefined
}

const builtinMedia = (id: string, picture = true): Media => ({
  // a word with no picture is shown as the word itself, big
  image: picture ? builtinImage(id) : '',
  audio: builtinAudioUrl(id),
  audioMid: builtinAudioUrl(`${id}--mid`),
  form: (form, mid) => builtinAudioUrl(`${id}--${form}${mid ? '--mid' : ''}`),
})

export function buildLibrary(cardRecords: CardRecord[], categoryRecords: CategoryRecord[], pack?: Pack | null): Category[] {
  const cardEdits = new Map(cardRecords.map((r) => [r.id, r]))
  const catEdits = new Map(categoryRecords.map((r) => [r.id, r]))

  const toCard = (base: VocabCard | null, rec: CardRecord | undefined, categoryId: string, media?: Media): Card => {
    const id = base?.id ?? rec!.id
    const m = base ? (media ?? builtinMedia(id, !!base.img)) : undefined
    // Suylo's clip says the original word, so it no longer fits once a parent renames the card.
    const renamed = !!rec?.label && rec.label !== base?.label
    const label = rec?.label ?? base?.label ?? ''
    // A parent's own word: Suylo's AI voice kept on the device, if it was made for this exact word.
    const madeVoice = rec?.suyloAudio && rec.suyloAudioLabel === label ? blobUrl(rec.suyloAudio) : undefined
    const suyloAudio = (base && !renamed ? m?.audio : undefined) ?? madeVoice
    const audio = rec?.audio ? blobUrl(rec.audio) : suyloAudio
    return {
      id,
      categoryId,
      label,
      type: (rec?.type ?? base?.type ?? 'noun') as WordType,
      mood: base?.mood as Mood | undefined,
      subject: base?.subject as SubjectCase | undefined,
      // A renamed «мен» (e.g. to the child's name) no longer fits «менин»/«мага», so its forms are dropped.
      forms:
        base?.forms && !renamed
          ? (Object.fromEntries(
              Object.entries(base.forms).map(([form, label]) => [form, { label, audio: m?.form(form), audioMid: m?.form(form, true) }]),
            ) as Partial<Record<string, WordForm>>)
          : undefined,
      say: renamed ? undefined : base?.say,
      frame: base?.frame as Frame | undefined,
      role: base?.role as Role | undefined,
      alt: base?.alt,
      person: base?.person as PersonCase | undefined,
      consume: base?.consume as Consume | undefined,
      kind: base?.kind as Kind | undefined,
      takes: base?.takes,
      obj: base?.obj,
      bare: base?.bare,
      use: base?.use,
      personAlt: base?.personAlt,
      who: base?.who,
      describes: base?.describes as Kind[] | undefined,
      stem: base?.stem,
      base: base?.base,
      auto: base?.auto,
      suffix: base?.suffix,
      pers: base?.pers,
      owner: base?.owner,
      // An empty image means a text card: the word itself is shown big (used by the big dictionary).
      image: rec?.image ? blobUrl(rec.image) : m ? m.image : PLACEHOLDER_IMAGE,
      audio,
      audioMid: rec?.audio || !suyloAudio || madeVoice === suyloAudio ? undefined : m?.audioMid,
      audioSource: rec?.audio ? 'parent' : suyloAudio ? 'suylo' : 'none',
      builtin: !!base,
      hidden: rec?.hidden ?? false,
    }
  }

  const customByCategory = new Map<string, CardRecord[]>()
  for (const rec of cardRecords) {
    if (!rec.custom) continue
    const list = customByCategory.get(rec.categoryId) ?? []
    list.push(rec)
    customByCategory.set(rec.categoryId, list)
  }
  const customCards = (categoryId: string) =>
    (customByCategory.get(categoryId) ?? [])
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((rec) => toCard(null, rec, categoryId))

  const custom: Category[] = categoryRecords
    .filter((r) => r.custom)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((rec) => {
      const cards = customCards(rec.id)
      return {
        id: rec.id,
        label: rec.label ?? '',
        icon: rec.image ? blobUrl(rec.image) : (cards[0]?.image ?? PLACEHOLDER_IMAGE),
        cards,
        builtin: false,
        hidden: rec.hidden ?? false,
      }
    })

  // The big dictionary: most of its words join the main topics («тамак-аш» gets every food), the rest
  // («транспорт», «мектеп») are topics of their own.
  const packCards = (cat: PackCategory) =>
    cat.cards.filter((c) => !PROMOTED.has(c.id)).map((c) =>
      toCard(c, cardEdits.get(c.id), cat.id, {
        image: c.image ? packImage(c.id) : '',
        audio: packAudio(c.id),
        audioMid: packAudio(c.id, true),
        form: (form, mid) => packAudio(`${c.id}--${form}`, mid),
      }),
    )
  const joining = new Map<string, Card[]>()
  for (const cat of pack?.categories ?? []) if (cat.into) joining.set(cat.into, [...(joining.get(cat.into) ?? []), ...packCards(cat)])

  const builtin: Category[] = vocab.categories.map((cat) => {
    const rec = catEdits.get(cat.id)
    return {
      id: cat.id,
      label: rec?.label ?? cat.label,
      icon: rec?.image ? blobUrl(rec.image) : builtinImage(`cat-${cat.id}`),
      cards: [...cat.cards.map((c) => toCard(c, cardEdits.get(c.id), cat.id)), ...(joining.get(cat.id) ?? []), ...customCards(cat.id)],
      builtin: true,
      hidden: rec?.hidden ?? false,
    }
  })

  const fromPack: Category[] = (pack?.categories ?? [])
    .filter((cat) => !cat.into)
    .map((cat) => {
      const rec = catEdits.get(cat.id)
      return {
        id: cat.id,
        label: rec?.label ?? cat.label,
        icon: rec?.image ? blobUrl(rec.image) : packImage(`cat-${cat.id}`),
        cards: [...packCards(cat), ...customCards(cat.id)],
        builtin: true,
        hidden: rec?.hidden ?? false,
        pack: true,
      }
    })

  const all = [...builtin, ...fromPack, ...custom]
  shareVoices(all)
  return all
}

// Dictionary words that now ship in the main deck (scripts/promote_core.py): shown once, not twice.
const PROMOTED = new Set(['pk-asks-ach', 'pk-pronouns-bul'])

/** The simple boards as they ship (src/data/board.json). */
export const BOARDS = boardData.boards

/**
 * The five fixed boards of the simple vocabulary: each slot holds its word, or nothing. A parent's changes
 * replace a board's slots; a hidden or missing word leaves its slot empty, so the other words never move.
 */
export function buildBoards(library: Category[], overrides: BoardSlots): Board[] {
  const cards = new Map(library.flatMap((c) => c.cards).map((card) => [card.id, card]))
  return BOARDS.map((b) => {
    const ids = overrides[b.id] ?? b.slots
    return {
      id: b.id,
      label: b.label,
      icon: builtinImage(`cat-${b.icon}`),
      slots: b.slots.map((_, i) => {
        const card = ids[i] ? cards.get(ids[i]!) : undefined
        return card && !card.hidden ? card : null
      }),
    }
  })
}

/** A parent's new thing is the kind its topic holds: a new food is eaten, a new toy is played with. */
const TOPIC_KIND: Record<string, Partial<Card>> = {
  food: { consume: 'eat' },
  fruits: { consume: 'eat' },
  play: { kind: 'toy' },
  clothes: { kind: 'clothes' },
  animals: { kind: 'animal' },
}

const norm = (label: string) => label.toLowerCase().replace(/\s+/g, ' ').trim()
// What a word is and how it changes; a parent's card with the same word as one of Suylo's gets all of it.
const GRAMMAR = ['say', 'forms', 'kind', 'consume', 'takes', 'obj', 'bare', 'use', 'personAlt', 'who', 'stem', 'base', 'auto', 'owner', 'frame', 'subject', 'person', 'role', 'alt', 'mood'] as const

/**
 * A card with no voice of its own — a parent's new card, or one renamed to another word — whose word is
 * one of Suylo's («оюнчук») speaks with Suylo's clip for that word, and follows its grammar when it is
 * the same kind of word. Without this it would fall back to the device's robot voice.
 */
function shareVoices(categories: Category[]) {
  const voiced = new Map<string, Card>()
  for (const c of categories) for (const card of c.cards) if (card.audioSource === 'suylo' && card.builtin) voiced.set(norm(card.label), card)
  for (const c of categories)
    c.cards = c.cards.map((card) => {
      const twin = card.audioSource === 'none' ? voiced.get(norm(card.label)) : undefined
      if (!twin) return card.builtin || card.type !== 'noun' ? card : { ...card, ...TOPIC_KIND[c.id] }
      const grammar = twin.type === card.type ? Object.fromEntries(GRAMMAR.map((k) => [k, twin[k]])) : { say: twin.say }
      return { ...card, ...grammar, audio: twin.audio, audioMid: twin.audioMid, audioSource: 'suylo' }
    })
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

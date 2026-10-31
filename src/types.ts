export type WordType =
  | 'pronoun'
  | 'person'
  | 'verb'
  | 'noun'
  | 'describe'
  | 'social'
  | 'negation'
  | 'phrase'

export type Mood = 'happy' | 'sad' | 'angry' | 'scared' | 'tired'

/** Grammatical case a verb wants for its subject: genitive («менин башым ооруп жатат») or dative («мага жагат»). */
export type SubjectCase = 'gen' | 'dat' | 'acc' | 'com' | 'abl'

export type PersonCase = 'dat' | 'acc' | 'com' | 'poss'

/** What a predicate takes: things («суу ичким»), a place («үйгө баргым»), or nothing («уктагым»). */
export type Frame = 'obj' | 'place' | 'none'

/** Grammar role for words that are not plain things: «мен», places, time words, question words. */
export type Role = 'me' | 'place' | 'time' | 'question' | 'alone' | 'adverb' | 'flex'
  /** A word of a fixed text (a poem a parent adds): lines with it are said exactly as tapped, no grammar. */
  | 'verbatim'
  /** A мүчө card («-га», «-дым»): joins the word before it. */
  | 'suffix'

export interface WordForm {
  label: string
  audio?: string
  /** Same word said mid-sentence (continuing intonation, no final fall). */
  audioMid?: string
}

export type Consume = 'eat' | 'drink'

/**
 * What a thing is, for choosing a verb that fits it: food is eaten, a bike is ridden, a car is driven,
 * clothes are worn. See TAKES in lib/grammar.ts for which verbs take which kinds.
 */
export type Kind =
  | 'food' | 'drink' | 'medicine'
  | 'toy' | 'ball' | 'game' | 'device'
  | 'screen' | 'show' | 'sight' | 'picture'
  | 'book' | 'symbol' | 'subject'
  | 'music' | 'song' | 'instrument'
  | 'clothes' | 'bike' | 'car' | 'transport'
  | 'animal' | 'horse'
  | 'thing' | 'container' | 'dish'
  | 'body' | 'event' | 'activity'
  | 'some'

/** A card as the child sees it, after parent edits are applied. */
export interface Card {
  id: string
  categoryId: string
  label: string
  type: WordType
  mood?: Mood
  /** Case this verb needs for its subject; «мен» changes to match. */
  subject?: SubjectCase
  /**
   * Grammatical forms: «мен» → менин/мага/мени…; people → «апам», «апама», «апамды», «апам менен»;
   * places → «базарга».
   */
  forms?: Partial<Record<string, WordForm>>
  /** Ending a person takes with this verb: «апама баргым», «апамды каалайм», «апам менен ойногум», «мага апам жагат». */
  person?: PersonCase
  /** Spelling only for the AI voice, e.g. «печенье» is read as «печение». */
  say?: string
  frame?: Frame
  role?: Role
  /** With a thing, this predicate is replaced by that card (e.g. «жакшы көрөм» → «жагат»). */
  alt?: string
  /** Food is eaten or drunk: «суу» wants «ичким», «нан» wants «жегим». */
  consume?: Consume
  /** What kind of thing this is (a noun); decides which verbs fit it. */
  kind?: Kind
  /** Which kinds of things this verb takes, by name of a rule in lib/grammar.ts (TAKES). */
  takes?: string
  /** A thing this verb is said with when the child tapped none: «тепким» → «велосипед тепким». */
  obj?: string
  /** The card to say instead when nothing goes with this verb: «кийгим» → «кийингим келип жатат». */
  bare?: string
  /** An activity word becomes this verb in a sentence: «окуу» → «окугум келип жатат». */
  use?: string
  /** With a person this verb has no ending for, say this card instead: «жагат» + «сен» → «Мен сени жакшы көрөм». */
  personAlt?: string
  /** The person this verb is said about when the child tapped nobody: «жакшы көрөм» → «Мен сени жакшы көрөм». */
  who?: string
  /** A describing word that only fits these kinds of things («таттуу» → food). */
  describes?: Kind[]
  /** A verb's stem («сүз», «эс ал»), for its forms: «сүздүм», «сүзүп жатам». */
  stem?: string
  /** The verb's base card («сүзүү»), whose ready-made forms have Suylo's clips. */
  base?: string
  /** A base verb («сүзүү») becomes this form in a sentence: «want» → «сүзгүм келип жатат», «doing» → «уялып жатам». */
  auto?: string
  /** A мүчө card: the ending it adds to the word before it («-га», «-дым»). */
  suffix?: string
  /** The word already says "my"/"your" («апам»), so «-га» is just «-а»: «апама». */
  possessed?: boolean
  /** Built from a word and endings the child tapped («алмага»). */
  joined?: boolean
  /** Offline, a joined word is said from pieces: the word's clip, then each ending's. */
  parts?: WordForm[]
  /** Who a pronoun is, for the verb to agree: «сен» = 2s, «ал» = 3s, «биз» = 1p… */
  pers?: string
  /** The "my" word in a verb card («баш» in «башым ооруп жатат»), which changes for others: «башың». */
  owner?: string
  image: string
  /** Playable audio URL, if any. Without it Suylo falls back to the device voice. */
  audio?: string
  /** Mid-sentence take of Suylo's clip, so sentences flow instead of sounding word-by-word. */
  audioMid?: string
  audioSource: 'parent' | 'suylo' | 'none'
  builtin: boolean
  hidden: boolean
}

export interface Category {
  id: string
  label: string
  icon: string
  cards: Card[]
  builtin: boolean
  hidden: boolean
  /** Comes from the optional big dictionary. */
  pack?: boolean
}

/** What a parent changed (built-in card) or created (custom card), stored in IndexedDB. */
export interface CardRecord {
  id: string
  categoryId: string
  custom: boolean
  label?: string
  type?: WordType
  image?: Blob
  audio?: Blob
  /** Suylo's AI voice for a word that has no clip of its own, made once while online and kept for offline. */
  suyloAudio?: Blob
  /** The word the AI voice clip says; a renamed card needs a new one. */
  suyloAudioLabel?: string
  hidden?: boolean
  createdAt: number
  updatedAt: number
}

export interface CategoryRecord {
  id: string
  custom: boolean
  label?: string
  image?: Blob
  hidden?: boolean
  createdAt: number
  updatedAt: number
}

export type CardSize = 'sm' | 'md' | 'lg'

/**
 * One board of the simple vocabulary: a fixed grid where every word keeps its slot, so the child learns
 * where each word is. An empty slot (null) stays empty — the other cards never move.
 */
export interface Board {
  id: string
  label: string
  icon: string
  slots: (Card | null)[]
}

/** A parent's changes to the boards: board id → card id per slot (null = empty). */
export type BoardSlots = Record<string, (string | null)[]>

/** 'simple': 56 big words on 5 fixed boards (the default); 'full': every topic and the big dictionary. */
export type Vocabulary = 'simple' | 'full'

export interface Settings {
  pinHash: string | null
  colorCoding: boolean
  cardSize: CardSize
  /** How fast Suylo speaks (1 = normal) and how high its voice is (1 = normal). */
  voiceSpeed: number
  voicePitch: number
  autoOrder: boolean
  /** Also guess what the child meant: swap a verb that does not fit, leave out or add words (off by default). */
  grammarGuess: boolean
  vocabulary: Vocabulary
  speakOnTap: boolean
  intro: boolean
  /** The first-run walkthrough was finished or skipped, so it stays hidden. */
  tutorialDone: boolean
  soundEffects: boolean
  /** The optional big dictionary was downloaded (see lib/pack.ts). */
  packInstalled: boolean
}

export const defaultSettings: Settings = {
  pinHash: null,
  colorCoding: true,
  cardSize: 'md',
  voiceSpeed: 1,
  voicePitch: 1,
  autoOrder: true,
  grammarGuess: false,
  vocabulary: 'simple',
  // The child builds a sentence first and presses Suylo to hear it.
  speakOnTap: false,
  intro: true,
  tutorialDone: false,
  soundEffects: true,
  packInstalled: false,
}

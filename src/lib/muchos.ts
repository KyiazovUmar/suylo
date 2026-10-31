import type { Card, WordForm } from '../types'

// Мүчөлөр: endings a child can tap after a word. Suylo picks the right variant by itself — vowel
// harmony and voicing (A Handbook of Kyrgyz Grammar; same rules as scripts/kyrgyz_morph.py):
//   «алма» + -га → «алмага», «мектеп» + -га → «мектепке», «үй» + -га → «үйгө», «апам» + -га → «апама»
//   «сүз» + -дым → «сүздүм», «ич» + -дым → «ичтим», «бер» + -чы → «берчи», «ойно» + -алы → «ойнойлу»

export type Suffix =
  | 'dat' | 'loc' | 'abl' | 'acc' | 'gen' | 'pl' | 'my' | 'your' | 'like' | 'without' | 'having' | 'q' | 'please'
  | 'want' | 'doing' | 'did' | 'lets' | 'dont'

/** Endings that make a verb form (they need a verb). */
export const VERB_SUFFIXES = new Set<Suffix>(['want', 'doing', 'did', 'lets', 'dont'])

const VOWELS = 'аеёиоөуүыэюя'
const VOICELESS = 'кпстфхцчшщ'
const LOW: Record<string, string> = { а: 'а', ы: 'а', у: 'а', я: 'а', ю: 'а', о: 'о', ё: 'о', э: 'е', е: 'е', и: 'е', ө: 'ө', ү: 'ө' }
const HIGH: Record<string, string> = { а: 'ы', ы: 'ы', я: 'ы', у: 'у', о: 'у', ё: 'у', ю: 'у', э: 'и', е: 'и', и: 'и', ө: 'ү', ү: 'ү' }
const LONG: Record<string, string> = { а: 'уу', ы: 'уу', у: 'уу', о: 'уу', я: 'уу', ю: 'уу', ё: 'уу', э: 'үү', е: 'үү', и: 'үү', ө: 'үү', ү: 'үү' }
const SOFTEN: Record<string, string> = { п: 'б', к: 'г' }

const lastVowel = (w: string) => [...w.toLowerCase()].reverse().find((c) => VOWELS.includes(c)) ?? 'а'
const endsInVowel = (w: string) => VOWELS.includes(w.slice(-1).toLowerCase())
const lastConsonant = (w: string) => {
  const s = w.toLowerCase()
  return 'ьъ'.includes(s.slice(-1)) ? s.slice(-2, -1) : s.slice(-1)
}
const voiceless = (w: string) => !endsInVowel(w) && VOICELESS.includes(lastConsonant(w))
/** A final п/к after a vowel softens before a vowel: «китеп» → «китеб-», «топ» → «тоб-» (but «парк» stays). */
const soften = (w: string) => (w.length > 1 && SOFTEN[w.slice(-1)] && VOWELS.includes(w.slice(-2, -1).toLowerCase()) ? w.slice(0, -1) + SOFTEN[w.slice(-1)] : w)
/** Verbs: «ук» → «уг-», «теп» → «теб-» before a vowel (but «корк-» stays). */
const softenVerb = (w: string) => (w.length > 1 && SOFTEN[w.slice(-1)] && VOWELS.includes(w.slice(-2, -1)) ? w.slice(0, -1) + SOFTEN[w.slice(-1)] : w)

/** The ending a word takes («га», «ке», «а»…), given how it ends. */
function nounEnding(w: string, suffix: Suffix, possessed: boolean): { word: string; ending: string } | null {
  const v = lastVowel(w)
  const d = voiceless(w) ? 'т' : 'д'
  switch (suffix) {
    case 'dat': // after «-м», «-ң» ("my", "your") just a vowel: «апама», «апаңа»
      return { word: w, ending: possessed ? LOW[v] : (voiceless(w) ? 'к' : 'г') + LOW[v] }
    case 'loc':
      return { word: w, ending: d + LOW[v] }
    case 'abl':
      return { word: w, ending: d + LOW[v] + 'н' }
    case 'acc':
      return { word: w, ending: (endsInVowel(w) ? 'н' : d) + HIGH[v] }
    case 'gen':
      return { word: w, ending: (endsInVowel(w) ? 'н' : d) + HIGH[v] + 'н' }
    case 'pl':
      return { word: w, ending: (endsInVowel(w) || 'йр'.includes(lastConsonant(w)) ? 'л' : d) + LOW[v] + 'р' }
    case 'my':
      return endsInVowel(w) ? { word: w, ending: 'м' } : { word: soften(w), ending: HIGH[v] + 'м' }
    case 'your':
      return endsInVowel(w) ? { word: w, ending: 'ң' } : { word: soften(w), ending: HIGH[v] + 'ң' }
    case 'like':
      return { word: w, ending: d + LOW[v] + 'й' }
    case 'without':
      return { word: w, ending: 'с' + HIGH[v] + 'з' }
    case 'having':
      return { word: w, ending: (endsInVowel(w) ? 'л' : d) + LONG[v] }
    case 'q':
      return { word: w, ending: (voiceless(w) ? 'п' : 'б') + HIGH[v] }
    case 'please': // on a noun: the person who does it («ыр» → «ырчы»)
      return { word: w, ending: 'ч' + HIGH[v] }
    default:
      return null
  }
}

/** A verb form from its stem: «сүз» → «сүздүм». Same as verb_forms() in scripts/kyrgyz_morph.py. */
export function verbForm(stem: string, suffix: Suffix): string | null {
  const head = stem.slice(0, stem.lastIndexOf(' ') + 1)
  const w = stem.slice(head.length)
  const v = lastVowel(w)
  const vowelEnd = endsInVowel(w)
  const make = (): string | null => {
    switch (suffix) {
      case 'want':
        return w + (voiceless(w) ? 'к' : 'г') + HIGH[v] + 'м келип жатат'
      case 'doing':
        return (vowelEnd ? w + 'п' : softenVerb(w) + HIGH[v] + 'п') + ' жатам'
      case 'did':
        return w + (voiceless(w) ? 'т' : 'д') + HIGH[v] + 'м'
      case 'lets':
        return vowelEnd ? w + (w.slice(-2, -1) === w.slice(-1) ? 'л' : 'йл') + HIGH[v] : softenVerb(w) + LOW[v] + 'л' + HIGH[LOW[v]]
      case 'dont':
        return w + (voiceless(w) ? 'п' : 'б') + LOW[v]
      case 'please':
        return w + 'ч' + HIGH[v]
      default:
        return null
    }
  }
  const out = make()
  return out && head + out
}

// «мен», «сен», «ал» change irregularly.
const PRONOUNS: Record<string, Partial<Record<Suffix, string>>> = {
  мен: { dat: 'мага', acc: 'мени', gen: 'менин', abl: 'менден', loc: 'менде' },
  сен: { dat: 'сага', acc: 'сени', gen: 'сенин', abl: 'сенден', loc: 'сенде' },
  ал: { dat: 'ага', acc: 'аны', gen: 'анын', abl: 'андан', loc: 'анда', pl: 'алар' },
}

/** Clip of an ending on its own, joined after a word's clip when Suylo speaks offline. */
export const endingClip = (ending: string) => `_sfx-${ending}`

export interface Joined {
  card: Card
}

/**
 * The word with the ending joined, or null when it does not go on that word (a verb ending on a thing).
 * `lookup` finds a verb's base card, whose ready-made forms carry Suylo's voice clips.
 */
export function attach(card: Card, suffix: Suffix, lookup: (id: string) => Card | undefined, clip: (id: string) => WordForm | undefined): Card | null {
  const isVerb = card.type === 'verb' || !!card.stem || !!card.base
  const base = card.base ? lookup(card.base) : undefined
  const stem = card.stem ?? base?.stem
  if (VERB_SUFFIXES.has(suffix) || (suffix === 'please' && stem)) {
    if (!stem) return null
    const ready = (base ?? card).forms?.[suffix]
    const label = ready?.label ?? verbForm(stem, suffix)
    if (!label) return null
    return { ...card, label, say: undefined, forms: undefined, audio: ready?.audio, audioMid: ready?.audioMid, parts: undefined, stem: undefined, base: undefined, joined: true }
  }
  if (isVerb && card.kind !== 'activity' && suffix !== 'q') return null // «-га» does not go on «сүзгүм келип жатат»
  const word = card.label.trim()
  const irregular = PRONOUNS[word.toLowerCase()]?.[suffix]
  if (irregular) {
    const form = card.forms ? Object.values(card.forms).find((f) => f?.label === irregular) : undefined
    return { ...card, label: irregular, say: undefined, forms: undefined, audio: form?.audio, audioMid: form?.audioMid, parts: undefined, role: undefined, type: 'pronoun', joined: true }
  }
  const head = word.slice(0, word.lastIndexOf(' ') + 1)
  const ending = nounEnding(word.slice(head.length), suffix, !!card.possessed)
  if (!ending) return null
  const label = head + ending.word + ending.ending
  // Offline the word is said from its clips: the word, then the ending («алма» + «га»).
  const softened = ending.word !== word.slice(head.length)
  const before = card.parts ?? (card.audio && !softened ? [{ label: card.label, audio: card.audioMid ?? card.audio, audioMid: card.audioMid ?? card.audio }] : undefined)
  const tail = clip(endingClip(ending.ending))
  return {
    ...card,
    label,
    say: undefined,
    forms: undefined,
    audio: undefined,
    audioMid: undefined,
    parts: before && tail ? [...before, tail] : undefined,
    possessed: suffix === 'my' || suffix === 'your',
    role: card.role === 'me' ? undefined : card.role,
    joined: true,
  }
}

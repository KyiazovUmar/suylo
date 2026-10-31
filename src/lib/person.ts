import type { Card } from '../types'

// The verb agrees with who the sentence is about (Kyrgyz person endings; A Handbook of Kyrgyz Grammar):
//   мен сүзгүм келип жатат · сен сүзгүң … · ал сүзгүсү … · биз сүзгүбүз … · алар сүзгүсү …
//   мен сүзүп жатам · сен … жатасың · ал … жатат · биз … жатабыз · алар … жатышат
//   мен сүздүм · сен сүздүң · ал сүздү · биз сүздүк
//   мен капамын · сен капасың · ал капа · биз капабыз
//   мен каалайм · сен каалайсың · ал каалайт · биз каалайбыз
//   менин башым ооруп жатат · сенин башың … · анын башы … · биздин башыбыз …
// Cards are written for «мен»; other people get these forms (ready-made with Suylo's clips where they exist).

export type Person = '1s' | '2s' | '2f' | '3s' | '1p' | '2p' | '3p'

const VOWELS = 'аеёиоөуүыэюя'
const LOW: Record<string, string> = { а: 'а', ы: 'а', у: 'а', я: 'а', ю: 'а', о: 'о', ё: 'о', э: 'е', е: 'е', и: 'е', ө: 'ө', ү: 'ө' }
const HIGH: Record<string, string> = { а: 'ы', ы: 'ы', я: 'ы', у: 'у', о: 'у', ё: 'у', ю: 'у', э: 'и', е: 'и', и: 'и', ө: 'ү', ү: 'ү' }
const lastVowel = (w: string) => [...w.toLowerCase()].reverse().find((c) => VOWELS.includes(c)) ?? 'а'
const endsInVowel = (w: string) => VOWELS.includes(w.slice(-1).toLowerCase())
/** Fills a suffix pattern: «ы» → a high vowel, «а» → a low vowel, each matching the vowel before it
 *  («кол» + «ыңар» → «колуңар»: о → у, then у → а). */
const harmony = (pattern: string, word: string) => {
  let prev = lastVowel(word)
  return [...pattern]
    .map((c) => {
      const out = c === 'ы' ? HIGH[prev] : c === 'а' ? LOW[prev] : c
      if (VOWELS.includes(out)) prev = out
      return out
    })
    .join('')
}
/** A final п/к after a vowel softens before a vowel: «кулак» → «кулаг-», «жап» → «жаб-». */
const soften = (w: string) => (/[аеёиоөуүыэюя][пк]$/.test(w) ? w.slice(0, -1) + (w.endsWith('п') ? 'б' : 'г') : w)

// "my / your / his …" after a vowel, and after a consonant
const POSS: Record<Person, [string, string]> = {
  '1s': ['м', 'ым'], '2s': ['ң', 'ың'], '2f': ['ңыз', 'ыңыз'], '3s': ['сы', 'ы'], '1p': ['быз', 'ыбыз'], '2p': ['ңар', 'ыңар'], '3p': ['сы', 'ы'],
}
const third = (p: Person) => p === '3s' || p === '3p'

/** «баш» → «башың» (2s), «уйку» → «уйкусу» (3s), «бир жер» → «бир жерибиз» (1p). */
export function possessive(owner: string, p: Person) {
  const head = owner.slice(0, owner.lastIndexOf(' ') + 1)
  const w = owner.slice(head.length)
  return head + (endsInVowel(w) ? w + harmony(POSS[p][0], w) : soften(w) + harmony(POSS[p][1], w))
}

/** The same, as the object: «колумду» → «колуңду», «колун» (3rd person). */
export const possessiveObject = (owner: string, p: Person) => {
  const mine = possessive(owner, p)
  return mine + (third(p) ? 'н' : harmony('ды', mine))
}

const DESIRE: Record<Person, string> = { '1s': 'м', '2s': 'ң', '2f': 'ңыз', '3s': 'сы', '1p': 'быз', '2p': 'ңар', '3p': 'сы' }
const PROGRESSIVE: Record<Person, string> = { '1s': 'жатам', '2s': 'жатасың', '2f': 'жатасыз', '3s': 'жатат', '1p': 'жатабыз', '2p': 'жатасыңар', '3p': 'жатышат' }
const BE: Record<Person, string> = { '1s': 'мын', '2s': 'сың', '2f': 'сыз', '3s': '', '1p': 'быз', '2p': 'сыңар', '3p': '' }
const PAST: Record<Person, string> = { '1s': 'м', '2s': 'ң', '2f': 'ңыз', '3s': '', '1p': 'к', '2p': 'ңар', '3p': '' }
const PRESENT: Record<Person, string> = { '1s': 'м', '2s': 'сың', '2f': 'сыз', '3s': 'т', '1p': 'быз', '2p': 'сыңар', '3p': 'т' }

/** A «мен» verb said for someone else: «сүзгүм келип жатат» → «сүзгүң келип жатат» (сен). */
export function conjugate(label: string, p: Person, owner?: string): string {
  if (p === '1s') return label
  let head = ''
  let rest = label
  // a "my" word in front: «башым ооруп жатат», «колумду жуугум келип жатат»
  if (owner) {
    const mine = possessive(owner, '1s')
    if (rest.startsWith(mine + ' ')) {
      head = possessive(owner, p) + ' '
      rest = rest.slice(mine.length + 1)
    } else if (rest.startsWith(possessiveObject(owner, '1s') + ' ')) {
      head = possessiveObject(owner, p) + ' '
      rest = rest.slice(possessiveObject(owner, '1s').length + 1)
    }
  }
  let m: RegExpMatchArray | null
  if ((m = rest.match(/^(.*[гк][ыиуү])м келип жатат$/))) rest = m[1] + harmony(DESIRE[p], m[1]) + ' келип жатат'
  else if ((m = rest.match(/^(.*) жатам$/))) rest = `${m[1]} ${PROGRESSIVE[p]}`
  else if ((m = rest.match(/^(.*)м[ыиуү]н$/))) rest = m[1] + harmony(BE[p], m[1])
  else if ((m = rest.match(/^(.*[дт][ыиуү])м$/))) rest = m[1] + harmony(PAST[p], m[1])
  else if ((m = rest.match(/^(.*(?:й|[аеоө]))м$/))) rest = m[1] + harmony(PRESENT[p], m[1])
  return head + rest
}

/** A command is the verb's stem («бер», «кел»). */
export const isCommand = (card: Card) => !!card.stem && card.stem === card.label && !!card.subject

// Commands to «сиз» are polite, to «силер» plural: «бер» → «бериңиз», «бергиле»; «кара» → «караңыз», «карагыла».
function command(stem: string, p: Person) {
  const head = stem.slice(0, stem.lastIndexOf(' ') + 1)
  const w = stem.slice(head.length)
  const voiceless = !endsInVowel(w) && 'кпстфхцчшщ'.includes(w.slice(-1))
  if (p === '2f') return head + (endsInVowel(w) ? w + harmony('ңыз', w) : soften(w) + harmony('ыңыз', w))
  if (p === '2p') return head + w + (voiceless ? 'к' : 'г') + harmony('ыла', w)
  return stem
}

/** The card as said for this person: its ready-made form (with Suylo's clip) or a made one. */
export function forPerson(card: Card, p: Person): Card {
  if (p === '1s') return card
  const ready = card.forms?.[`p${p}`]
  const label = ready?.label ?? (isCommand(card) ? command(card.label, p) : conjugate(card.label, p, card.owner))
  if (label === card.label) return card
  return { ...card, label, say: undefined, audio: ready?.audio, audioMid: ready?.audioMid }
}

// Every word form Suylo can make, checked against the rules of Kyrgyz spelling and sound — independently of
// the code that makes them:
//   • vowel harmony: each vowel of an ending follows the vowel before it (high: ы/и/у/ү, low: а/е/о/ө);
//   • voicing: after a voiceless consonant (к п с т ф х ц ч ш щ) an ending starts with к/т/п, not г/д/б;
//   • the person: a sentence about «сен», «ал», «биз»… keeps no «мен» ending.
// Run: node --experimental-strip-types tests/exhaustive.ts
import { readFileSync } from 'node:fs'
import { attach, verbForm, VERB_SUFFIXES, type Suffix } from '../src/lib/muchos.ts'
import { forPerson, type Person } from '../src/lib/person.ts'
import { buildSentence, roleOf, sentenceText } from '../src/lib/grammar.ts'
import type { Card } from '../src/types.ts'

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const vocab = read('../src/data/vocab.json')
const pack = read('../public/pack/pack.json')
const toCard = (c: any, categoryId: string): Card => ({ ...c, categoryId, image: '', audioSource: 'suylo', builtin: true, hidden: false,
  forms: c.forms ? Object.fromEntries(Object.entries(c.forms).map(([k, v]) => [k, { label: v as string }])) : undefined }) as Card
const cards: Card[] = [...vocab.categories.flatMap((cat: any) => cat.cards.map((c: any) => toCard(c, cat.id))), ...pack.categories.flatMap((cat: any) => cat.cards.map((c: any) => toCard(c, cat.id)))]
const byId = new Map(cards.map((c) => [c.id, c]))
const AND = { id: '_and', label: 'жана', type: 'social' } as Card
const helpers = { and: AND, with: { ...AND, id: '_with', label: 'менен' } as Card, lookup: (id: string) => byId.get(id) }

const VOWELS = 'аеёиоөуүыэюя'
const HIGH: Record<string, string> = { а: 'ы', ы: 'ы', я: 'ы', у: 'у', о: 'у', ё: 'у', ю: 'у', э: 'и', е: 'и', и: 'и', ө: 'ү', ү: 'ү' }
const LOW: Record<string, string> = { а: 'а', ы: 'а', у: 'а', я: 'а', ю: 'а', о: 'о', ё: 'о', э: 'е', е: 'е', и: 'е', ө: 'ө', ү: 'ө' }
const isHigh = (v: string) => 'ыиуү'.includes(v)
const VOICELESS = 'кпстфхцчшщ'

const problems = new Map<string, string[]>()
const flag = (rule: string, ex: string) => {
  const l = problems.get(rule) ?? []
  if (l.length < 6 && !l.includes(ex)) l.push(ex)
  problems.set(rule, l)
}

/** Checks the ending added to `stem` to make `word` (both one word). */
function checkEnding(stem: string, word: string, what: string) {
  const s = stem.toLowerCase(), w = word.toLowerCase()
  // the stem may change its last letter before a vowel (китеп → китеб-, кулак → кулаг-)
  let i = 0
  while (i < s.length && s[i] === w[i]) i++
  if (i < s.length - 1) return // a different word (мен → мага): irregular, checked by hand
  if (/[аеёиоөуүыэюя][пк]$/.test(s) && w.startsWith(s) && VOWELS.includes(w[s.length] ?? '')) flag(`п/к should soften before a vowel (${what})`, `${stem} → ${word}`)
  const ending = w.slice(i === s.length - 1 ? s.length : i)
  const before = s.slice(0, i === s.length - 1 ? s.length : i)
  let prev = [...w.slice(0, w.length - ending.length)].reverse().find((c) => VOWELS.includes(c))
  if (!prev) return
  const rounded = /^[лдт](уу|үү)$/.test(ending) // «-луу» is always rounded: тиштүү, күчтүү, акылдуу
  for (const c of ending) {
    if (!VOWELS.includes(c)) continue
    const want = rounded ? ('еиөүэ'.includes(prev) ? 'ү' : 'у') : isHigh(c) ? HIGH[prev] : LOW[prev]
    if (c !== want) flag(`vowel harmony (${what})`, `${stem} → ${word}: «${c}» should be «${want}»`)
    prev = c
  }
  const last = before.replace(/[ьъ]$/, '').slice(-1) || before.slice(-1)
  const voicelessSoft = /[кпстфхцчшщ][ьъ]$/.test(before)
  const first = ending[0]
  if (last && VOICELESS.includes(last) && 'гдб'.includes(first)) flag(`voicing (${what})`, `${stem} → ${word}`)
  if (last && !voicelessSoft && !VOICELESS.includes(last) && !VOWELS.includes(last) && 'кпт'.includes(first) && !'кпт'.includes(last) && !(last === 'й' && ending === 'т')) {
    // after a voiced consonant an ending starts voiced (except «-сыз», «-чы», and endings that are always к/п)
    flag(`voicing after a voiced sound (${what})`, `${stem} → ${word}`)
  }
}
const lastWord = (t: string) => t.trim().split(/\s+/).pop()!

// 1. every мүчө on every word it can go on
const NOUN_SUFFIXES: Suffix[] = ['dat', 'loc', 'abl', 'acc', 'gen', 'pl', 'my', 'your', 'like', 'without', 'having', 'q', 'please']
const ALL_SUFFIXES: Suffix[] = [...NOUN_SUFFIXES, 'want', 'doing', 'did', 'lets', 'dont']
let n1 = 0
for (const c of cards) {
  if (c.role === 'suffix' || c.role === 'verbatim') continue
  for (const sfx of ALL_SUFFIXES) {
    const out = attach(c, sfx, helpers.lookup, () => undefined)
    if (!out) continue
    n1++
    if (VERB_SUFFIXES.has(sfx) || (sfx === 'please' && (c.stem || c.base))) {
      const stem = c.stem ?? helpers.lookup(c.base!)?.stem
      if (stem) checkEnding(lastWord(stem), lastWord(out.label.replace(/ (келип жатат|жатам)$/, '')), `verb -${sfx}`)
    } else if (c.label.toLowerCase() !== 'мен' && !['сен', 'ал'].includes(c.label.toLowerCase())) {
      checkEnding(lastWord(c.label), lastWord(out.label), `-${sfx}`)
    }
    // a second ending after the first («апам» + «-га»)
    for (const s2 of ['dat', 'acc', 'pl'] as Suffix[]) {
      const out2 = attach(out, s2, helpers.lookup, () => undefined)
      if (out2) { n1++; checkEnding(lastWord(out.label), lastWord(out2.label), `-${sfx} then -${s2}`) }
    }
  }
}
// the Python generator (voice clips) and the app must make the same verb forms
let n2 = 0
for (const c of cards) {
  if (!c.stem || !c.forms) continue
  for (const s of ['want', 'doing', 'did', 'lets', 'dont', 'please'] as Suffix[]) {
    const py = c.forms[s]?.label
    if (!py) continue
    n2++
    const ts = verbForm(c.stem, s)
    if (py !== ts) flag('app and voice clips disagree', `${c.stem} -${s}: app «${ts}», clip «${py}»`)
  }
}

// 2. every verb for every person
const PEOPLE: Person[] = ['2s', '2f', '3s', '1p', '2p', '3p']
const preds = cards.filter((c) => roleOf(c) === 'pred' && c.role !== 'verbatim')
let n3 = 0
const MINE = /(^|\s)\S*[ыиуү]?м(ды|ди|ду|дү|а|е|о|ө)?\s/ // a word ending in «my» before another word
for (const c of preds) {
  for (const p of PEOPLE) {
    const out = forPerson(c, p)
    n3++
    const l = out.label
    if (/[гк][ыиуү]м келип жатат$/.test(l)) flag('«мен» ending left (want)', `${p}: ${c.label} → ${l}`)
    if (/ жатам$/.test(l)) flag('«мен» ending left (doing)', `${p}: ${c.label} → ${l}`)
    if (/м[ыиуү]н$/.test(l) && !/ым[ыиуү]н$/.test(l)) flag('«мен» ending left (-мын)', `${p}: ${c.label} → ${l}`)
    const mineWord = c.label.split(' ').find((w) => /м(ды|ди|ду|дү)?$/.test(w))
    if (c.owner && mineWord && l.split(' ').includes(mineWord)) flag('«my» word left', `${p}: ${c.label} → ${l}`)
    if (l !== c.label) {
      const a = c.label.split(' '), b = l.split(' ')
      a.forEach((w, i) => b[i] && b[i] !== w && b[i].startsWith(w.slice(0, Math.max(1, w.length - 3))) && checkEnding(w.replace(/(м|ым|им|ум|үм)$/, ''), b[i], `person ${p}`))
    }
  }
}
void MINE

// 3. every subject with every verb, as a sentence
const subjects = ['мен', 'сен', 'ал', 'биз', 'алар', 'сиз', 'силер'].map((l) => cards.find((c) => c.label === l && c.role !== 'verbatim')!)
let n4 = 0
const sentences: string[] = []
for (const s of subjects)
  for (const v of preds) {
    const toks = buildSentence([{ key: 1, card: s }, { key: 2, card: v }], helpers, 'guess')
    const text = sentenceText(toks)
    n4++
    sentences.push(text)
    const words = text.toLowerCase().replace(/[.,?]/g, '').split(' ')
    if (s.label !== 'мен' && words.includes('мен')) flag('«мен» in a sentence about someone else', text)
    if (/\s{2}|,\.|\.\.| ,/.test(text)) flag('punctuation', text)
    if (toks.some((t) => t.dropped && t.key === '1')) flag('subject left out', text)
    for (let i = 1; i < words.length; i++) if (words[i] === words[i - 1] && words[i] !== 'жатат') flag('word twice', text)
  }

console.log(`мүчөлөр: ${n1} words · verb forms vs clips: ${n2} · verbs × people: ${n3} · subject × verb sentences: ${n4}`)
console.log(problems.size ? `${problems.size} kinds of problem:` : 'no problems')
for (const [rule, ex] of problems) console.log(`  ✗ ${rule}:\n      ${ex.join('\n      ')}`)
if (process.argv[2] === 'print') console.log(sentences.join('\n'))
process.exitCode = problems.size ? 1 : 0

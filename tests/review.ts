// Prints the sentences Suylo builds, for a native speaker to read through.
// Run: node --experimental-strip-types tests/review.ts verbs | people | things
import { readFileSync } from 'node:fs'
import { buildSentence, kindsOf, roleOf, sentenceText } from '../src/lib/grammar.ts'
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const vocab = read('../src/data/vocab.json')
const pack = read('../public/pack/pack.json')
const toCard = (c: any, categoryId: string) => ({ ...c, categoryId, image: '', audioSource: 'suylo', builtin: true, hidden: false, forms: c.forms ? Object.fromEntries(Object.entries(c.forms).map(([k, v]) => [k, { label: v }])) : undefined })
const cards = [...vocab.categories.flatMap((cat: any) => cat.cards.map((c: any) => toCard(c, cat.id))), ...pack.categories.flatMap((cat: any) => cat.cards.map((c: any) => toCard(c, cat.id)))]
const byId = new Map(cards.map((c: any) => [c.id, c]))
const byLabel = (l: string) => cards.find((c: any) => c.label === l)
const AND = { id: '_and', label: 'жана', type: 'social' } as any
const helpers = { and: AND, with: { ...AND, id: '_with', label: 'менен' }, lookup: (id: string) => byId.get(id) as any }
const say = (...cs: any[]) => sentenceText(buildSentence(cs.map((card, i) => ({ key: i + 1, card })), helpers, 'guess'))
const me = byLabel('мен')
const mode = process.argv[2]
if (mode === 'verbs') for (const v of cards.filter((c: any) => roleOf(c) === 'pred' || c.type === 'phrase')) console.log(`${v.label.padEnd(34)} → ${say(me, v)}`)
if (mode === 'people') {
  const people = ['апа', 'бөбөк', 'дос', 'мугалим', 'үй-бүлө', 'сен', 'ал', 'алар', 'космонавт', 'таене', 'коңшу'].map(byLabel)
  const verbs = cards.filter((c: any) => roleOf(c) === 'pred' && c.person)
  for (const v of verbs) console.log(`${v.label}:\n   ${people.map((p: any) => say(me, p, v)).join('\n   ')}`)
}
if (mode === 'things') {
  const seen = new Set<string>()
  const reps = cards.filter((c: any) => roleOf(c) === 'object' && !c.use && !seen.has(kindsOf(c).join()) && seen.add(kindsOf(c).join()))
  const verbs = cards.filter((c: any) => roleOf(c) === 'pred' && (c.takes || c.frame === 'obj'))
  for (const v of verbs) console.log(`${v.label}:  ${reps.map((n: any) => say(me, n, v)).join(' | ')}`)
}

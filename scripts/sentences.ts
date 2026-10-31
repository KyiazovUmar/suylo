// Lists the sentences Suylo pre-records in its AI voice (whole sentence, natural intonation), so they sound
// smooth on any device — not only on the laptop running `npm run ai`. Suylo says sentences exactly as the child
// tapped them, so a sentence is the tapped words in order. Most likely first: those are saved on the device for
// offline use ("core"); the rest are fetched the first time they're said.
// Run: node --experimental-strip-types scripts/sentences.ts > /tmp/sentences.json
import { readFileSync } from 'node:fs'
import { buildSentence, fit, roleOf } from '../src/lib/grammar.ts'
import { spokenKey } from '../src/lib/sentenceKey.ts'
import type { Card } from '../src/types.ts'

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const toCard = (c: any, categoryId: string): Card => ({ ...c, categoryId, image: '', audioSource: 'suylo', builtin: true, hidden: false,
  forms: c.forms ? Object.fromEntries(Object.entries(c.forms).map(([k, v]) => [k, { label: v }])) : undefined }) as Card
const main: Card[] = read('../src/data/vocab.json').categories.flatMap((cat: any) => cat.cards.map((c: any) => toCard(c, cat.id)))
const pack: Card[] = read('../public/pack/pack.json').categories.flatMap((cat: any) => cat.cards.map((c: any) => toCard(c, cat.id)))
const all = [...main, ...pack]
const byId = new Map(all.map((c) => [c.id, c]))
const AND = { id: '_and', label: 'жана', type: 'social' } as Card
const helpers = { and: AND, with: { ...AND, id: '_with', label: 'менен' } as Card, lookup: (id: string) => byId.get(id) }

const out = new Map<string, boolean>() // sentence → saved offline
let core = true
const say = (taps: (Card | undefined)[]) => {
  if (taps.some((t) => !t)) return
  const toks = buildSentence(taps.map((card, i) => ({ key: i + 1, card: card! })), helpers, 'off').filter((t) => !t.dropped)
  if (toks.length < 2) return
  const key = spokenKey(toks.map((t) => ({ text: t.card.label, say: t.card.say, punct: t.punct })))
  if (!out.has(key)) out.set(key, core)
}

// ---- the simple boards (the default)
const board = read('../src/data/board.json')
const simple: Card[] = board.boards.flatMap((b: any) => b.slots).filter(Boolean).map((id: string) => byId.get(id)!)
const me = byId.get('me')!
const leads = ['me', 'you', 'mom', 'dad'].map((id) => byId.get(id)!)
const preds = simple.filter((c) => roleOf(c) === 'pred')
const others = simple.filter((c) => roleOf(c) !== 'pred')
const goesWith = (x: Card, v: Card) => fit(v, x) !== undefined || (x.type === 'person' && !!v.person) || roleOf(x) === 'place'

// saved offline: «мен»/«сен»/«апа»/«ата» + any word («мен суу», «апа кайда»), a word + a verb it goes with
// («суу ичким келип жатат»), and «мен» + a word + its verb («мен суу ичким келип жатат»)
for (const lead of leads) for (const x of simple) if (x !== lead) say([lead, x])
for (const x of others) for (const v of preds) if (goesWith(x, v)) say([x, v])
for (const x of others) for (const v of preds) if (x !== me && goesWith(x, v)) say([me, x, v])
const offline = out.size

// recorded, fetched when first said: every other pair of the simple words, and a lead + word + any verb
core = false
for (const a of simple) for (const b of simple) if (a !== b) say([a, b])
for (const lead of leads) for (const x of others) for (const v of preds) if (x !== lead) say([lead, x, v])

// ---- «Толук»: «мен» + one word of the main deck or the big dictionary («мен ичким келип жатат», «мен апа»)
for (const c of [...main, ...pack]) if (c.role !== 'verbatim' && c.role !== 'suffix' && c !== me) say([me, c])

console.error(`offline: ${offline}, all: ${out.size}`)
console.log(JSON.stringify([...out].map(([key, saved]) => ({ key, core: saved }))))

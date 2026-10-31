// Writes each default verb's forms for «сен», «ал», «биз», «алар» into src/data/vocab.json (as p2s, p3s,
// p1p, p3p), so `gen_audio.py --missing` gives them Suylo's voice and they work offline.
// Run: node --experimental-strip-types scripts/person_forms.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { conjugate, type Person } from '../src/lib/person.ts'

const path = new URL('../src/data/vocab.json', import.meta.url)
const vocab = JSON.parse(readFileSync(path, 'utf8'))
const PEOPLE: Person[] = ['2s', '3s', '1p', '3p']
let n = 0
for (const cat of vocab.categories)
  for (const card of cat.cards) {
    if (card.role === 'verbatim' || card.role === 'suffix' || card.kind === 'activity') continue
    if (card.type !== 'verb' && card.type !== 'phrase' && card.type !== 'negation') continue
    for (const p of PEOPLE) {
      const label = conjugate(card.label, p, card.owner)
      if (label === card.label) continue
      card.forms = { ...(card.forms ?? {}), [`p${p}`]: label }
      n++
    }
  }
writeFileSync(path, JSON.stringify(vocab, null, 2) + '\n')
console.log(`${n} person forms`)

// Downloads a Fluent Emoji 3D illustration for every card and category in src/data/vocab.json.
// Fluent Emoji © Microsoft, MIT License — https://github.com/microsoft/fluentui-emoji
//
// Usage: node scripts/fetch-images.mjs [--force]
// "img" is the emoji's folder name in that repo; "tone": true picks the medium skin tone (dark hair, closest to Kyrgyz kids).

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const vocab = JSON.parse(await readFile(new URL('src/data/vocab.json', root), 'utf8'))
const outDir = new URL('public/cards/', root)
const force = process.argv.includes('--force')
const RAW = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets'

await mkdir(outDir, { recursive: true })

async function exists(url) {
  try { await access(url); return true } catch { return false }
}

function candidates(name, tone) {
  const dir = encodeURIComponent(name)
  const slug = name.toLowerCase().replace(/ /g, '_')
  const plain = `${RAW}/${dir}/3D/${slug}_3d.png`
  const toned = (t) => `${RAW}/${dir}/${t}/3D/${slug}_3d_${t.toLowerCase()}.png`
  return tone ? [toned('Medium'), toned('Default'), plain] : [plain, toned('Default')]
}

async function download(name, tone, file) {
  if (!force && (await exists(file))) return true
  for (const url of candidates(name, tone)) {
    const res = await fetch(url)
    if (res.ok) {
      await writeFile(file, Buffer.from(await res.arrayBuffer()))
      return true
    }
  }
  return false
}

const jobs = []
for (const cat of vocab.categories) {
  jobs.push([`cat-${cat.id}`, cat.icon, cat.icon === 'Woman'])
  for (const card of cat.cards) if (card.img) jobs.push([card.id, card.img, !!card.tone])
}

// Icons for the first-run tutorial and the parents' guide.
const UI = {
  'ui-point': ['Backhand index pointing up', true],
  'ui-model': ['Woman teacher', true],
  'ui-start': ['Red apple', false],
  'ui-photo': ['Camera with flash', false],
  'ui-voice': ['Studio microphone', false],
  'ui-praise': ['Clapping hands', true],
  'ui-place': ['Round pushpin', false],
  'ui-heart': ['Blue heart', false],
}
for (const [id, [name, tone]] of Object.entries(UI)) jobs.push([id, name, tone])

const missing = []
await Promise.all(
  jobs.map(async ([id, name, tone]) => {
    if (!(await download(name, tone, new URL(`${id}.png`, outDir)))) missing.push(`${id} (${name})`)
  }),
)
console.log(`${jobs.length - missing.length}/${jobs.length} images in public/cards/`)
if (missing.length) console.log('Not found:', missing.join(', '))

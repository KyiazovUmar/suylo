import type { Card, Category } from '../types'

// Word search. Parents and older children type however their keyboard lets them: in Kyrgyz («үй-бүлө»),
// on a Russian keyboard without ү ө ң («уй було»), or in Latin letters the way people text («ui bulo»,
// «jakshy korom»). All of them are folded to the same plain Latin key before comparing.
const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'io', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia',
}

export function searchKey(text: string) {
  return [...text.toLowerCase()]
    .map((c) => LATIN[c] ?? c)
    .join('')
    .replace(/zh/g, 'j')
    .replace(/kh/g, 'h')
    .replace(/y/g, 'i') // ы, й and и are all «y» or «i» when typed in Latin
    .replace(/[^a-z0-9]/g, '')
}

/** Cards whose word matches, best first: the word starts with what was typed, then contains it. */
export function searchCards(categories: Category[], query: string, limit = 60): Card[] {
  const q = searchKey(query)
  if (!q) return []
  // Short searches match the start of a word («ата» → «ата», «Аяз ата», not «жатам»); longer ones also
  // inside a word, and several typed words can span words («jakshy korom»).
  const severalWords = query.trim().split(/\s+/).length > 1
  const seen = new Set<string>()
  const scored: { card: Card; score: number }[] = []
  for (const cat of categories)
    for (const card of cat.cards) {
      if (seen.has(card.id)) continue
      seen.add(card.id)
      const words = card.label.split(/[\s-]+/).map(searchKey)
      const whole = searchKey(card.label)
      const score =
        whole === q ? 0
        : words.some((w) => w.startsWith(q)) || whole.startsWith(q) ? 1
        : q.length >= 4 && (words.some((w) => w.includes(q)) || (severalWords && whole.includes(q))) ? 2
        : -1
      if (score >= 0) scored.push({ card, score })
    }
  return scored
    .sort((a, b) => a.score - b.score || a.card.label.length - b.card.label.length)
    .slice(0, limit)
    .map((s) => s.card)
}

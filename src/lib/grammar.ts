import type { Card, Kind, PersonCase, SubjectCase, WordForm } from '../types'
import { attach, type Suffix } from './muchos.ts' // .ts: the tests run this file directly in Node
import { forPerson, isCommand, possessive, possessiveObject, type Person } from './person.ts'

// Suylo's Kyrgyz sentence builder.
//
// A child taps cards in any order — «мен», «суу», «гамбургер» — and Suylo says a correct Kyrgyz
// sentence: «Мен суу жана гамбургер каалайм.» The rules, with where they come from:
//
// • Word order is subject–object–verb; a clause ends with its predicate.            (Wikipedia: Kyrgyz grammar)
// • The verb decides the case of «мен»:
//     «каалайм», «капамын», «-гым келип жатат» → «мен»: «Мен суу ичким келип жатат» (spoken Kyrgyz;
//       the manual's «Баргым келди» "I want to go" carries the person on the verb).
//     words that themselves say "my" («башым ооруп жатат», «уйкум келди», «курсагым ачты») → «менин».
//     «жагат», «жакпайт», «керек», «бер», «жардам бер» → dative «мага».   (Peace Corps lessons: «Мага тоолор
//       жагат», «Мага эт жакпайт»; manual: «Мага нан керек» "I need bread")
// • People get suffixes (мүчөлөр) from their verb: «Мен апама баргым келип жатат», «Мен апамды каалайм»,
//   «Мен апам менен ойногум келип жатат», «Мага апам керек». Otherwise they are being spoken to: «Апа, …».
//   (Suffix rules: A Handbook of Kyrgyz Grammar, Wikibooks — see scripts/kyrgyz_morph.py.)
// • Verbs carry the person ending, so «мен» is said once and later clauses drop it.   (Wikipedia: person suffixes)
// • Objects of these predicates are general (indefinite) → no case ending: «суу ичким», «алма каалайм».
// • Several things are joined with «жана»; the person being spoken to goes first, with a pause: «Апа, …».
// • A thing chooses its verb: drinks («суу», «сүт», «чай», «шорпо») take «ичким», food «жегим», a bike
//   «тепким» («велосипед тебүү»), a car «айдагым», clothes «кийгим», music «уккум». A verb that does not fit
//   the thing is corrected («машина ичким» → «машина айдагым»). See TAKES below.
// • Some verbs give the thing an ending: «мышыкты кучактагым» (accusative), «автобуска түшкүм» (dative),
//   «оюнчук менен ойногум» (with), «Менин көзүм ооруп жатат» / «колумду жуугум» (my).
//
// What the child did not tap but grammar needs («жана», «каалайм», «баргым келип жатат») is added and
// marked `auto`, so the strip can show it as a faded helper word. Anything that cannot join one clause
// becomes its own short, correct sentence — the builder never produces a broken one.
//
// Modes (GrammarMode): 'form' — the default — only puts the child's own words in the right form and order
// (endings, agreement, «жана» between them); it never swaps, drops or adds a word, because the child's message
// belongs to the child. 'guess' also guesses what the child meant: corrects a verb that does not fit
// («машина ичким» → «машина айдагым»), leaves out words that do not belong, adds «каалайм», «бир нерсени».
// 'off' says the cards exactly as tapped.

export type GrammarMode = 'off' | 'form' | 'guess'

export interface Tapped {
  key: number
  card: Card
}

export interface Token {
  key: string
  card: Card
  /** Added by grammar, not tapped by the child. */
  auto: boolean
  /** Punctuation after this word: a pause for speech, a full stop, or a question. */
  punct?: ',' | '.' | '?'
  /** Tapped, but has nothing to do with the sentence: shown crossed out and not said («алма» + «сүзгүм»). */
  dropped?: boolean
  /** Every tap a joined word is made of («алма», «-га»), so clearing removes them all. */
  keys?: string[]
}

type Role = 'me' | 'person' | 'social' | 'question' | 'time' | 'describe' | 'object' | 'place' | 'pred' | 'phrase'

export function roleOf(c: Card): Role {
  if (c.role === 'me') return 'me'
  if (c.role === 'suffix') return 'phrase'
  if (c.kind === 'activity') return 'object' // «сүзүү»: a verb's plain form, said as a word until it joins a sentence
  if (c.subject || c.frame || c.takes) return 'pred'
  if (c.type === 'phrase') return 'phrase'
  if (c.type === 'verb') return 'pred'
  if (c.type === 'person') return 'person'
  // «сен», «ал», «биз» take endings like people do («сени», «сага», «сени менен»); other pronouns
  // («өзүм») are said on their own
  if (c.type === 'pronoun') return c.forms ? 'person' : 'phrase'
  if (c.role === 'question' || c.role === 'time' || c.role === 'place') return c.role
  if (c.role === 'alone') return 'phrase' // «ичинде», «баары»: need «X-тын …», so said on their own
  if (c.type === 'social' || c.type === 'negation') return 'social'
  if (c.type === 'describe') return 'describe'
  return 'object'
}

/** What a predicate takes: things («суу ичким»), a place («үйгө баргым»), or nothing («уктагым»). */
const frameOf = (c: Card) => c.frame ?? (c.takes ? 'obj' : 'none')

// ---------------------------------------------------------------- what goes with what

/**
 * How a thing is said with its verb: as it is («суу ичким»), followed by «менен» («оюнчук менен ойногум»),
 * or with an ending from its forms: «мышыкты кучактагым» (acc), «автобуска түшкүм» (dat),
 * «Менин көзүм ооруп жатат» (poss), «колумду жуугум» (possAcc).
 */
export type ObjCase = '' | 'com' | 'acc' | 'dat' | 'poss' | 'possAcc'

/** Things you can hold, give, buy or show — and «бир нерсе» ("something"). */
const THINGS: Kind[] = ['food', 'drink', 'medicine', 'toy', 'ball', 'device', 'book', 'picture', 'symbol', 'clothes', 'bike', 'car', 'transport', 'animal', 'horse', 'thing', 'container', 'dish', 'instrument', 'some']
const WANTABLE: Kind[] = [...THINGS, 'screen', 'music', 'song', 'game', 'sight', 'show']
const as = (kinds: Kind[], c: ObjCase = ''): Partial<Record<Kind, ObjCase>> => Object.fromEntries(kinds.map((k) => [k, c]))

/** For each kind of verb (a card's `takes`), the kinds of things it goes with, and how. */
export const TAKES: Record<string, Partial<Record<Kind, ObjCase>>> = {
  want: as(WANTABLE), // «алма каалайм», «мультфильм каалайм»
  about: as([...WANTABLE, 'subject', 'event', 'activity']), // «Мага алма жагат», «Мага окуу керек» (the thing is the subject)
  thing: as(THINGS), // «мага суу бер», «сатып алгым», «көрсөт», «издегим»
  count: as([...THINGS, 'sight']), // «жылдыз санагым»
  eat: as(['food', 'some']),
  drink: as(['drink', 'medicine', 'some']), // «дары ичким»
  play: { game: '', ball: '', device: '', some: '', ...as(['toy', 'animal', 'horse', 'car', 'thing', 'container', 'dish', 'instrument', 'sight', 'picture'], 'com') }, // «топ ойногум», «мышык менен ойногум»
  watch: as([...THINGS, 'screen', 'sight', 'show', 'game']), // «мультфильм көргүм», «футбол көргүм»
  read: as(['book', 'symbol', 'subject', 'some']),
  listen: as(['music', 'song', 'instrument', 'some']), // «музыка уккум»
  sing: as(['song', 'some']), // «ыр ырдагым»
  wear: as(['clothes', 'some']), // «көйнөк кийгим»
  ride: as(['bike']), // «велосипед тепким», «самокат тепким»
  drive: as(['car', 'transport']), // «машина айдагым»
  board: as(['car', 'transport'], 'dat'), // «автобуска түшкүм»
  mount: as(['horse']), // «ат мингим»
  hug: as(['animal', 'horse', 'toy'], 'acc'), // «мышыкты кучактагым»
  open: as(['container', 'book', 'some'], 'acc'), // «эшикти ач», «кутуну ачкым», «бир нерсени ачкым»
  wash: { ...as(['dish', 'car', 'clothes', 'toy', 'ball', 'food', 'some']), body: 'possAcc' }, // «идиш жуугум», «колумду жуугум»
  write: as(['symbol', 'some']), // «тамга жазгым»
  paint: as(['picture', 'some']),
  learn: as(['subject', 'instrument', 'some']), // «комуз үйрөнгүм»
  hurt: { body: 'poss' }, // «Менин көзүм ооруп жатат»
  go: as(['car', 'transport', 'bike'], 'com'), // «машина менен баргым»
}
/** «ал», «алар» go with a verb as it is («Мага ал жагат»); «сен», «сиз», «биз» change it. */
const AGREES_ALREADY = new Set(['ал', 'алар'])

/** Verbs that take almost anything; they never make a thing look for its own verb. */
const UNIVERSAL = new Set(['want', 'about', 'thing', 'count'])

/** Verbs of the same sort: a thing whose own verb is of the sort the child tapped belongs in the sentence
 *  («суу» + «нан» + «жегим» → «суу ичким … жана нан жегим …»). Anything else that fits no tapped verb is left out. */
const FAMILY: Record<string, string> = {
  eat: 'food', drink: 'food',
  ride: 'ride', drive: 'ride', board: 'ride', mount: 'ride', go: 'ride',
  watch: 'media', listen: 'media', read: 'media', sing: 'media',
}
/** Words that are not about things but are about food: «Менин курсагым ачты жана нан жегим келип жатат». */
const FAMILY_OF: Record<string, string> = { hungry: 'food', 'pk-feelings-achkamyn': 'food', 'pk-actions-tamak-jasagym-kelip-jatat': 'food' }

/** The verb a thing goes with when the child's verb does not fit it (the first one that exists). */
const NATURAL: Record<Kind, string[]> = {
  food: ['eat'], drink: ['drink'], medicine: ['drink'],
  toy: ['play-verb'], ball: ['play-verb'], game: ['play-verb'], device: ['play-verb'],
  screen: ['watch'], show: ['watch'], sight: ['watch'], picture: ['watch'],
  book: ['read'], symbol: ['read'], subject: ['read'],
  music: ['listen'], song: ['listen'], instrument: ['listen'],
  clothes: ['wear'], bike: ['ride'], car: ['drive'], transport: ['pk-board', 'drive'],
  animal: ['watch'], horse: ['pk-mount', 'watch'],
  thing: ['want'], container: ['want'], dish: ['want'], some: ['want'],
  body: ['pk-hurt'], event: ['like'], activity: [],
}

/** A card said in one of its forms («апама», «мышыкты»). Its voice-only spelling was for the plain word. */
const inForm = (card: Card, form: WordForm): Card => ({ ...card, label: form.label, audio: form.audio ?? card.audio, audioMid: form.audioMid, say: undefined })

/** What a thing is. A parent's own card with no kind is just a thing. */
export function kindsOf(c: Card): Kind[] {
  const kinds: Kind[] = []
  if (c.consume) kinds.push(c.consume === 'drink' ? 'drink' : 'food')
  if (c.kind) kinds.push(c.kind)
  return kinds.length ? kinds : ['thing']
}

/** How `verb` takes `thing`, or undefined when they do not go together («машина» + «ичким»). */
export function fit(verb: Card, thing: Card): ObjCase | undefined {
  const takes = verb.takes ? TAKES[verb.takes] : frameOf(verb) === 'obj' ? TAKES.want : undefined
  if (!takes) return undefined
  for (const k of kindsOf(thing)) {
    const c = takes[k]
    if (c === undefined) continue
    // an ending needs the word's form («мышыкты»); a parent's own card has none
    if (c === '' || c === 'com' || thing.forms?.[c]) return c
  }
  return undefined
}

interface Noun {
  tok: Token
  prefix: Token[]
  card: Card
  idx: number
  /** Kept with a verb it does not fit, as tapped ('form' mode): said plain, with no ending. */
  loose?: boolean
}

interface Clause {
  pred: Token
  card: Card
  idx: number
  objects: Noun[]
  places: Noun[]
  prefix: Token[]
  /** A person who is part of this clause, already in the right form («апама», «апам менен»). */
  person?: Token
  /** Tapped by the child (grammar-added clauses never take a person). */
  tapped: boolean
}

/** Helper words «жана» and «менен», supplied by the caller so they carry Suylo's voice clips. */
export interface Helpers {
  and: Card
  with: Card
  lookup: (id: string) => Card | undefined
  /** Suylo's clip of an ending on its own («га»), to say a joined word offline. */
  clip?: (id: string) => WordForm | undefined
}

export function buildSentence(tapped: Tapped[], helpers: Helpers, mode: GrammarMode | boolean = 'form'): Token[] {
  const grammar = mode !== false && mode !== 'off'
  /** Guessing what the child meant: swapping, leaving out or adding words. Off in 'form' mode. */
  const guess = mode === true || mode === 'guess'
  const plain = (i: Tapped): Token => ({ key: String(i.key), card: i.card, auto: false })

  // Мүчөлөр the child tapped join the word before them, in the variant that word needs:
  // «алма» + «-га» → «алмага», «мектеп» + «-га» → «мектепке», «сүзүү» + «-дым» → «сүздүм».
  // The joined word keeps the ending's key, so «⌫» takes the ending off again.
  const items: Tapped[] = []
  const strayEndings: Token[] = [] // an ending with nothing it can go on: crossed out
  const madeOf = new Map<number, number[]>() // a joined word's taps
  for (const item of tapped) {
    if (item.card.role !== 'suffix') {
      items.push(item)
      continue
    }
    const prev = items[items.length - 1]
    const card = prev && attach(prev.card, item.card.suffix as Suffix, helpers.lookup, helpers.clip ?? (() => undefined))
    if (card) {
      items[items.length - 1] = { key: item.key, card }
      madeOf.set(item.key, [...(madeOf.get(prev.key) ?? [prev.key]), item.key])
    } else strayEndings.push({ ...plain(item), dropped: true })
  }
  const asTapped = (i: Tapped): Token => ({ ...plain(i), keys: madeOf.get(i.key)?.map(String) })

  if (!grammar) {
    // Exactly as tapped, in the order tapped; only the end gets its tone: a question («апа кайда?») or a full stop.
    const line = items.map(asTapped)
    if (line.length) {
      const last = line[line.length - 1]
      const question = items.some((i) => i.card.role === 'question' || isQuestion(i.card.label))
      line[line.length - 1] = { ...last, punct: question ? '?' : '.' }
    }
    return [...line, ...strayEndings]
  }
  // Said exactly as tapped: a line of a fixed text (words may repeat), or a sentence the
  // child built with мүчөлөр — they chose every ending themselves. «…бы» at the end asks a question.
  if (items.length && items.some((i) => i.card.role === 'verbatim' || i.card.joined)) {
    // a verb the child gave an ending agrees with «сен», «биз»… before it: «биз» + «сүзүү» + «-дым» → «Биз сүздүк»
    let who: Person = '1s'
    const line = items.map((i) => {
      if (i.card.pers) who = i.card.pers as Person
      return i.card.joined && i.card.type === 'verb' ? { ...asTapped(i), card: forPerson(i.card, who) } : asTapped(i)
    })
    const last = line[line.length - 1]
    line[line.length - 1] = { ...last, punct: /(бы|би|бу|бү|пы|пи|пу|пү)$/.test(last.card.label) ? '?' : '.' }
    return [...line, ...strayEndings]
  }
  let autoN = 0
  const add = (card: Card): Token => ({ key: `auto-${card.id}-${autoN++}`, card, auto: true })

  // The same card twice says nothing new («суу суу»): keep the first.
  const seen = new Set<string>()
  const list = items.filter((i) => !seen.has(i.card.id) && !!seen.add(i.card.id))

  const socials: Token[] = []
  const persons: Token[] = []
  const questions: Token[] = []
  const times: Token[] = []
  const phrases: { idx: number; tok: Token }[] = []
  const extras: Token[] = [] // «сен», «ичинде»: said only on their own
  const nouns: Noun[] = []
  const places: Noun[] = []
  const clauses: Clause[] = []
  let me: Tapped | null = null
  let pending: Token[] = [] // «дагы», «тез»: before the next thing or verb
  let adjectives: Token[] = [] // «кызыл», «чоң», «эки»: only ever before a thing
  let adverbs: Token[] = [] // «абдан»: goes before the next verb, never before a thing
  let lastNoun: Noun | null = null

  for (const [idx, item] of list.entries()) {
    const t = plain(item)
    switch (roleOf(item.card)) {
      case 'me':
        me ??= item
        break
      case 'social':
        socials.push(t)
        break
      case 'person':
        persons.push(t)
        break
      case 'question':
        questions.push(t)
        break
      case 'time':
        times.push(t)
        break
      case 'phrase':
        if (item.card.type === 'phrase') phrases.push({ idx, tok: t })
        else extras.push(t)
        break
      case 'describe':
        if (item.card.role === 'adverb') adverbs.push(t)
        else if (item.card.role === 'flex') pending.push(t)
        else adjectives.push(t)
        break
      case 'object':
      case 'place': {
        // «дагы», «көп» before the colour or size: «дагы кызыл топ»
        const n: Noun = { tok: t, prefix: [...pending, ...adjectives], card: item.card, idx }
        pending = []
        adjectives = []
        ;(roleOf(item.card) === 'place' ? places : nouns).push(n)
        lastNoun = n
        break
      }
      case 'pred':
        clauses.push({ pred: t, card: item.card, idx, objects: [], places: [], prefix: [...pending, ...adverbs], tapped: true })
        pending = []
        adverbs = []
        break
    }
  }
  const lonely: Token[] = [] // describing words with nothing to describe: said as their own short sentence
  // Who the sentence is about: «мен», or else the first «сен», «ал», «биз»… tapped. The verbs agree with
  // it («Сен сүзгүң келип жатат», «Ал капа»); the others are who it is done to or with («Мен сени …»).
  if (!me) {
    const p = persons.find((t) => t.card.pers)
    if (p) {
      me = { key: Number(p.key), card: p.card }
      persons.splice(persons.indexOf(p), 1)
    }
  }
  const pers = (me?.card.pers ?? '1s') as Person

  // «абдан» tapped after the verb still goes in front of it; with no verb it is said on its own.
  if (adverbs.length) {
    if (clauses.length) clauses[clauses.length - 1].prefix.unshift(...adverbs)
    else lonely.push(...adverbs)
  }
  // Describing words tapped last still go in front of their noun: «алма» + «эки» → «эки алма».
  // A colour or size with no thing at all is said on its own, as a separate short sentence.
  if (adjectives.length) {
    if (lastNoun) lastNoun.prefix.push(...adjectives)
    else lonely.push(...adjectives)
  }
  if (pending.length) {
    if (lastNoun) lastNoun.prefix.push(...pending)
    else if (clauses.length) clauses[clauses.length - 1].prefix.push(...pending)
    else lonely.push(...pending)
    pending = []
  }

  // A describing word that does not fit its thing is left out: «таттуу алма», but not «таттуу күн».
  const misfits: Token[] = []
  if (guess) for (const n of [...nouns, ...places]) {
    const kinds = kindsOf(n.card)
    const fits = (t: Token) => !t.card.describes || t.card.describes.some((k) => kinds.includes(k))
    misfits.push(...n.prefix.filter((t) => !fits(t)))
    n.prefix = n.prefix.filter(fits)
  }

  // A base verb («сүзүү», «уялуу») in a sentence becomes its form, automatically: the card it is linked to
  // («сүзгүм келип жатат»), or its own ready-made form («уялып жатам»).
  const activityVerb = (c: Card): Card | undefined => {
    const linked = c.use ? helpers.lookup(c.use) : undefined
    if (linked) return linked
    const form = c.auto ? c.forms?.[c.auto] : undefined
    if (!form) return undefined
    return { ...c, type: 'verb', kind: undefined, use: undefined, auto: undefined, forms: undefined, say: undefined, label: form.label, audio: form.audio, audioMid: form.audioMid }
  }

  // Replace a tapped verb by the right one; it stays the child's card (same key), just corrected.
  const swap = (clause: Clause, card: Card) => {
    clause.card = card
    clause.pred = { ...clause.pred, card }
  }
  const newClause = (id: string, idx: number) => {
    const card = helpers.lookup(id)
    if (!card) return null
    const c: Clause = { pred: add(card), card, idx, objects: [], places: [], prefix: [], tapped: false }
    clauses.push(c)
    return c
  }

  // «жакшы көрөм» with a thing becomes «мага … жагат» (the thing would otherwise need extra case endings).
  if (nouns.length) {
    for (const c of clauses) {
      if (c.card.alt && frameOf(c.card) !== 'obj') {
        const alt = helpers.lookup(c.card.alt)
        if (alt) swap(c, alt)
      }
    }
  }

  // Activity words become their verb next to anything else: «мен» + «окуу» → «Мен окугум келип жатат»,
  // «нан» + «ичүү» → «Нан жегим келип жатат» (but «Мага окуу жагат»; alone, «Окуу.» is just the word).
  for (const n of [...nouns]) {
    const verb = activityVerb(n.card)
    if (!verb || list.length < 2 || clauses.some((c) => fit(c.card, n.card) !== undefined)) continue
    nouns.splice(nouns.indexOf(n), 1)
    const prefix = n.prefix.filter((t) => t.card.role === 'flex')
    lonely.push(...n.prefix.filter((t) => t.card.role !== 'flex'))
    clauses.push({ pred: { ...n.tok, card: verb }, card: verb, idx: n.idx, objects: [], places: [], prefix, tapped: true })
  }

  // Places go to «баргым келип жатат» (added when there is «мен» or another verb), in the dative:
  // «базар» → «базарга».
  for (const p of places) {
    const c = clauses.find((cl) => frameOf(cl.card) === 'place') ?? (guess && (me || clauses.length) ? newClause('go', p.idx) : null)
    if (!c) {
      // Not guessing and the verb is not about going: the place is where it happens, «сыртка» → «сыртта»
      // («Мен сыртта ойногум келип жатат»). With no verb at all it is just named.
      const host = !guess && (clauses.filter((o) => o.idx > p.idx).sort((x, y) => x.idx - y.idx)[0] ?? clauses[clauses.length - 1])
      const loc = p.card.forms?.loc
      if (host) host.places.push({ ...p, tok: loc ? { ...p.tok, card: inForm(p.card, loc) } : p.tok, loose: true })
      else nouns.push(p)
      continue
    }
    // claimed by «баргым келип жатат»
    const dat = p.card.forms?.dat
    if (dat) p.tok = { ...p.tok, card: inForm(p.card, dat) }
    c.places.push(p)
  }

  // Things go to a tapped verb that fits them: one made for them before one that takes anything
  // («велосипед» → «тепким» rather than «каалайм»), the next one after the thing, else the last one before.
  const general = (c: Clause) => !!c.card.takes && UNIVERSAL.has(c.card.takes)
  const waiting: Noun[] = []
  for (const n of nouns) {
    const all = clauses.filter((c) => fit(c.card, n.card) !== undefined)
    const options = all.some((c) => !general(c)) ? all.filter((c) => !general(c)) : all
    const c = options.filter((o) => o.idx > n.idx).sort((a, b) => a.idx - b.idx)[0] ?? options[options.length - 1]
    if (c) c.objects.push(n)
    else waiting.push(n)
  }

  // A verb that got nothing it fits while a thing waits was the wrong card: it is corrected to the thing's
  // own verb and stays the child's card («машина» + «ичким» → «машина айдагым», «велосипед» + «ойногум»
  // → «велосипед тепким», «суу» + «жегим» → «суу ичким»).
  const naturalVerb = (n: Noun) => {
    if (n.card.use || n.card.auto) return activityVerb(n.card)
    for (const k of kindsOf(n.card))
      for (const id of NATURAL[k]) {
        const v = helpers.lookup(id)
        if (v && fit(v, n.card) !== undefined) return v
      }
    return undefined
  }
  // (Only to a verb made for the thing: «жегим» is not turned into «каалайм» or «жагат».)
  if (guess) for (const c of clauses) {
    if (!c.tapped || frameOf(c.card) !== 'obj' || c.objects.length || (c.card.person && persons.length)) continue
    const n = waiting.find((w) => {
      const v = naturalVerb(w)
      if (!v || (v.takes && UNIVERSAL.has(v.takes)) || clauses.some((cl) => cl.card.id === v.id)) return false
      return v.takes !== 'hurt' || general(c)
    })
    if (!n) continue
    swap(c, naturalVerb(n)!)
    for (const w of [...waiting])
      if (fit(c.card, w.card) !== undefined) {
        c.objects.push(w)
        waiting.splice(waiting.indexOf(w), 1)
      }
  }

  // Still waiting. With no verb tapped, things are wanted («Мен суу жана гамбургер каалайм»), or take their
  // own verb when they cannot be wanted («Менин көзүм ооруп жатат»); with nobody talking they are just named
  // («суу жана нан»). With verbs tapped, a thing takes its own verb only when that verb is of the same sort
  // as one the child tapped («суу» + «нан» + «жегим»); a thing that has nothing to do with the sentence is
  // left out («алма» + «сүзгүм» → «Сүзгүм келип жатат»).
  const tappedVerbs = clauses.filter((c) => c.tapped)
  const topics: Token[] = [] // things named before the sentence ('form' mode)
  const family = (v: Card) => (v.takes ? FAMILY[v.takes] : FAMILY_OF[v.id])
  const want = helpers.lookup('want')
  const leftovers: Noun[] = []
  const dropped: Token[] = [...misfits, ...strayEndings]
  for (const n of waiting) {
    // Not guessing: a thing no tapped verb fits stays where the child put it, before the next verb, as it is
    // («мен» + «машина» + «ичким» → «Мен машина ичким келип жатат»); with no verb it is just named.
    if (!guess) {
      const c = clauses.filter((o) => o.idx > n.idx).sort((a, b) => a.idx - b.idx)[0] ?? clauses[clauses.length - 1]
      // a verb that takes no thing («капамын», «уктагым») would make it sound like its object: the thing is
      // named first instead («Телефон, мен капамын»)
      if (c && frameOf(c.card) === 'obj') c.objects.push({ ...n, loose: true })
      else if (c) topics.push(...n.prefix, n.tok)
      else leftovers.push(n)
      continue
    }
    let verb: Card | undefined
    if (!tappedVerbs.length) {
      if (me || clauses.length) verb = want && fit(want, n.card) !== undefined ? want : naturalVerb(n)
    } else {
      const own = naturalVerb(n)
      if (own && family(own) && tappedVerbs.some((c) => family(c.card) === family(own))) verb = own
    }
    const c = verb ? (clauses.find((cl) => cl.card.id === verb.id) ?? newClause(verb.id, n.idx)) : null
    if (c) c.objects.push(n)
    else if (tappedVerbs.length) dropped.push(...n.prefix, n.tok)
    else leftovers.push(n)
  }

  // Parts in the order the child tapped their words: a verb that took an earlier thing comes where that thing was.
  const at = (c: Clause) => Math.min(c.idx, ...c.objects.map((n) => n.idx), ...c.places.map((n) => n.idx))
  clauses.sort((a, b) => at(a) - at(b))

  // People: a verb that has a place for a person takes them with the right suffix; everyone else is
  // the one being spoken to. «апа» + «баргым келип жатат» → «апама»; with a place → «апам менен паркка».
  const FORM: Record<PersonCase, string> = { dat: 'possDat', acc: 'possAcc', com: 'possCom', poss: 'poss' }
  const vocatives: Token[] = []
  const strays: Token[] = [] // «сен» with no verb to take it
  const formFor = (p: Token, c: Clause) => {
    const kind: PersonCase | undefined = c.card.person === 'dat' && c.places.length ? 'com' : c.card.person
    // «Мага ал керек», but «сен» changes the verb: «Мага сен керексиң», «Мага сен жакпайсың»
    if (kind === 'poss' && p.card.type === 'pronoun' && !AGREES_ALREADY.has(p.card.label) && !c.card.forms?.[p.card.id]) return undefined
    return kind ? p.card.forms?.[FORM[kind]] : undefined
  }
  for (const p of persons) {
    const open = clauses.filter((cl) => cl.tapped && cl.card.person && !cl.person && !(cl.card.person === 'acc' && cl.objects.length))
    let c = open.find((cl) => formFor(p, cl))
    // «жагат» has no ending for «сен» (it would have to become «жагасың»), so it becomes «жакшы көрөм»:
    // «мен» + «сен» + «жагат» → «Мен сени жакшы көрөм»
    if (!c) {
      c = open.find((cl) => cl.card.personAlt && !cl.objects.length && helpers.lookup(cl.card.personAlt))
      if (c) swap(c, helpers.lookup(c.card.personAlt!)!)
    }
    const form = c && formFor(p, c)
    if (c && form) {
      c.person = { ...p, card: inForm(p.card, form) }
      const agreed = c.card.forms?.[p.card.id]
      if (agreed) c.pred = { ...c.pred, card: inForm(c.card, agreed) }
    } else if (p.card.type === 'pronoun') strays.push(p)
    else vocatives.push(p)
  }
  // A verb said about someone, with nobody tapped: «жакшы көрөм» → «Мен сени жакшы көрөм».
  if (guess) for (const c of clauses) {
    const who = !c.person && !c.objects.length && c.card.who ? helpers.lookup(c.card.who) : undefined
    // «Мен сени жакшы көрөм», «Биз сени жакшы көрөбүз»; not «сен сени», nor «Ал сени өпкүсү келип жатат»
    if (who && me && (who.id === me.card.id || (pers !== '1s' && pers !== '1p'))) continue
    const form = who && formFor({ key: '', card: who, auto: true }, c)
    if (who && form && !list.some((i) => i.card.id === who.id)) c.person = { ...add(who), card: inForm(who, form) }
  }
  // «сен» that no verb takes: next to a sentence it is left out; with «мен» alone → «Мен жана сен»;
  // otherwise it is who is being spoken to.
  if (clauses.length) {
    if (guess) dropped.push(...strays)
    else vocatives.push(...strays) // not guessing: «сен» stays, as who is spoken to («Сен, мен …»)
  } else if (!me) vocatives.push(...strays)

  // A verb with nothing to go with it: some are said with their usual thing («тепким» → «велосипед тепким»,
  // «каалайм» → «бир нерсени каалайм», «бер» → «бир нерсени бер»), some have a word of their own
  // («кийгим» → «кийингим келип жатат»). A person can be what the verb is about («Мен апамды каалайм»).
  for (const c of clauses) {
    if (c.objects.length || c.places.length || (c.person && c.card.person !== 'com')) continue
    const obj = guess && c.card.obj ? helpers.lookup(c.card.obj) : undefined
    if (obj && !list.some((i) => i.card.id === obj.id)) c.objects.push({ tok: add(obj), prefix: [], card: obj, idx: c.idx })
    else if (c.card.bare) {
      const bare = helpers.lookup(c.card.bare)
      if (bare) swap(c, bare)
    }
  }

  // The verbs agree with who the sentence is about: «сүзгүм» → «сүзгүң» (сен), «сүзгүсү» (ал)…
  if (pers !== '1s') for (const c of clauses) c.pred = { ...c.pred, card: forPerson(c.pred.card, pers) }

  // ---------------------------------------------------------------- assemble
  const out: Token[] = []
  const pushAll = (toks: Token[]) => out.push(...toks)
  const withAnd = (groups: Token[][]): Token[] =>
    groups.flatMap((g, i) => {
      if (i === 0) return g
      return i === groups.length - 1 ? [add(helpers.and), ...g] : g
    })
  const list2 = (ns: Noun[]) => {
    const groups = ns.map((n) => [...n.prefix, n.tok])
    // «A, B жана C»: commas between all but the last pair
    groups.slice(0, -2).forEach((g) => (g[g.length - 1] = { ...g[g.length - 1], punct: ',' }))
    return withAnd(groups)
  }

  // Things in the form their verb gives them: «мышыкты», «автобуска», «көзүм»; «… менен» after the list.
  // As objects, words like «окуу китеби» take their object form («окуу китебин окугум»).
  const objectsOf = (c: Clause): Token[] => {
    if (!c.objects.length) return []
    const cases = c.objects.map((n) => (n.loose ? '' : (fit(c.card, n.card) ?? '')))
    const withMenen = cases.includes('com')
    const groups = c.objects.map((n, i) => {
      if (n.loose) return [...n.prefix, n.tok]
      // with «менен» the things stay as they are; «жагат», «керек» are about the thing, so no object form
      const key = withMenen ? undefined : cases[i] || (c.card.takes === 'about' ? undefined : 'obj')
      const form = key ? n.card.forms?.[key] : undefined
      // "my eye" becomes "your eye" when it is about «сен»
      if (pers !== '1s' && (key === 'poss' || key === 'possAcc')) {
        const label = key === 'poss' ? possessive(n.card.label, pers) : possessiveObject(n.card.label, pers)
        return [...n.prefix, { ...n.tok, card: { ...n.card, label, say: undefined, audio: undefined, audioMid: undefined } }]
      }
      const tok = form ? { ...n.tok, card: inForm(n.card, form) } : n.tok
      return [...n.prefix, tok]
    })
    groups.slice(0, -2).forEach((g) => (g[g.length - 1] = { ...g[g.length - 1], punct: ',' }))
    const toks = withAnd(groups)
    return withMenen ? [...toks, add(helpers.with)] : toks
  }

  const hasQuestion = questions.length > 0
  // Opening: «Салам, апа, …». With a question and no verb, people are who it's about: «апа кайда?».
  const aboutPerson = hasQuestion && !clauses.length && !nouns.length
  const vocative = aboutPerson ? [] : vocatives
  const opening = [...socials, ...vocative, ...topics]
  if (opening.length) {
    opening.forEach((t) => out.push({ ...t, punct: ',' }))
  }

  // «мен» in the case the verb needs. The child may have tapped «мага» or «менин» from the big
  // dictionary; it is still «мен» underneath, so the plain form comes from the main «мен» card.
  const meToken = (needed: SubjectCase | undefined): Token | null => {
    if (!me) return null
    const t = plain(me)
    const base = me.card.role !== 'me' || me.card.label === 'мен' ? me.card : (helpers.lookup('me') ?? me.card)
    if (!needed) return { ...t, card: base }
    const form = me.card.forms?.[needed] ?? base.forms?.[needed]
    return form ? { ...t, card: inForm(base, form) } : { ...t, card: base }
  }

  // A command to «сен» is still about the child: «Сен мага бир нерсени бер», «Сен мени күт», «Сен менден кет».
  const toYou = (c: Clause) => pers.startsWith('2') && isCommand(c.card) && !!c.card.subject
  const speaker = (c: Clause, i: number): Token[] => {
    if (!guess) return []
    const child = helpers.lookup('me')
    const form = child?.forms?.[c.card.subject!]
    return child && form ? [{ ...add(child), key: `speaker-${i}`, card: inForm(child, form) }] : []
  }

  if (clauses.length) {
    clauses.forEach((c, i) => {
      const parts: Token[] = []
      if (i === 0) {
        const s = meToken(toYou(c) ? undefined : c.card.subject)
        if (s) parts.push(s)
        if (toYou(c)) parts.push(...speaker(c, i))
        parts.push(...times)
      } else if (c.card.subject && c.card.subject !== 'gen' && !clauses.slice(0, i).some((d) => d.card.subject === c.card.subject)) {
        // a verb that does not carry "I" itself needs «мага» again — once: «Мен бир нерсени каалайм жана мага
        // бир нерсени бер», «… мага жардам бер жана ач»
        const s = toYou(c) ? null : meToken(c.card.subject)
        if (s) parts.push({ ...s, key: `${s.key}-${i}`, auto: true })
        else parts.push(...speaker(c, i))
      }
      if (c.person) parts.push(c.person)
      parts.push(...objectsOf(c), ...list2(c.places)) // «машина менен үйгө баргым»
      if (i === clauses.length - 1) parts.push(...questions)
      parts.push(...c.prefix, c.pred)
      // Between parts, like a list: commas, and «жана» before the last one — or a comma there too when
      // it already has its own «жана» («Жегим келип жатат, кыш жана бий каалайм», not «… жана кыш жана бий …»).
      if (i > 0) {
        if (i < clauses.length - 1 || parts.some((t) => t.card.id === helpers.and.id)) out[out.length - 1] = { ...out[out.length - 1], punct: ',' }
        else out.push(add(helpers.and))
      }
      pushAll(parts)
    })
  } else {
    // No verb at all: name things («суу жана нан»), with «мен» and/or the question.
    const s = meToken(undefined)
    const subjectPersons = aboutPerson ? vocatives : []
    const us = withAnd([...(s ? [[s]] : []), ...(me ? strays.map((t) => [t]) : [])]) // «Мен жана сен»
    // (places not claimed by a verb were already moved into `nouns`)
    pushAll([...us, ...times, ...subjectPersons, ...list2(nouns), ...questions])
  }

  // Ready-made sentences («мага тыныгуу керек») are spoken as their own sentence, after the built one.
  const sentences: Token[][] = []
  // «мен» + «бул эмне»: a ready-made sentence already says who it is about, so a lone «Мен.» is left out
  if (guess && phrases.length && out.length === 1 && me && out[0].key === String(me.key)) dropped.push(out.pop()!)
  if (out.length) sentences.push(out)
  phrases.forEach((p) => sentences.push([p.tok]))
  // A colour with no thing, «абдан» with no verb, «сен», «ичинде»: on their own they are said; next to a
  // real sentence they mean nothing, so they are left out.
  const alone = [...lonely, ...extras]
  // Not guessing, with nothing but «мен» or a name before it, a lone word joins it: «Мен дагы», «Ата, дагы».
  if (!guess && alone.length && out.length && !clauses.length && !nouns.length && !questions.length && !phrases.length) {
    out.push(...alone)
    alone.length = 0
  }
  if (sentences.length && guess) dropped.push(...alone)
  else if (alone.length) sentences.push(alone) // not guessing: said too, as a short sentence of their own
  // Remove a trailing comma left by an opening with nothing after it («Салам, апа»).
  const said = sentences.flatMap((s) => {
    const last = s[s.length - 1]
    const question = (s === out && hasQuestion) || (s !== out && isQuestion(last.card.label))
    s[s.length - 1] = { ...last, punct: question ? '?' : '.' }
    return s
  })
  return [...said, ...dropped.map((t) => ({ ...t, punct: undefined, dropped: true }))]
}

// Ready-made questions («саат канча», «апам кайда») end with a question mark.
const QUESTION_WORDS = /(^|\s)(эмне|ким|кимсиң|кайда|качан|кантип|канча|кандай|кандайсың|кандайсыз|эмнеге|кайсы)(\s|$)/
const isQuestion = (text: string) => QUESTION_WORDS.test(text.toLowerCase())

/** Plain text of a sentence, with punctuation, as shown (words left out are not part of it). */
export function sentenceText(tokens: Token[]) {
  const said = tokens.filter((t) => !t.dropped)
  return said
    .map((t, i) => {
      // Labels are already lowercase except names («Бишкек», «Аяз ата»), which keep their capital.
      const word = t.card.label
      const text = i === 0 || said[i - 1].punct === '.' || said[i - 1].punct === '?' ? word.charAt(0).toUpperCase() + word.slice(1) : word
      return text + (t.punct ?? '')
    })
    .join(' ')
}

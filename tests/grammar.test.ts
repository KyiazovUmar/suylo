// Grammar tests: golden sentences checked against the sources in src/lib/grammar.ts, plus a fuzz test
// that taps random cards thousands of times and checks the result is always well-formed Kyrgyz.
// Run: node --experimental-strip-types tests/grammar.test.ts
import { readFileSync } from 'node:fs'
import { buildSentence, fit, kindsOf, roleOf, sentenceText, TAKES, type Token } from '../src/lib/grammar.ts'
import type { Card } from '../src/types.ts'
import { possessive, possessiveObject, type Person } from '../src/lib/person.ts'

type Raw = Record<string, any>
const vocab = JSON.parse(readFileSync(new URL('../src/data/vocab.json', import.meta.url), 'utf8'))
const pack = JSON.parse(readFileSync(new URL('../public/pack/pack.json', import.meta.url), 'utf8'))

const toCard = (c: Raw, categoryId: string): Card => ({
  ...c,
  categoryId,
  image: '',
  audioSource: 'suylo',
  builtin: true,
  hidden: false,
  forms: c.forms ? Object.fromEntries(Object.entries(c.forms).map(([k, v]) => [k, { label: v as string }])) : undefined,
} as Card)

const cards: Card[] = [
  ...vocab.categories.flatMap((cat: Raw) => cat.cards.map((c: Raw) => toCard(c, cat.id))),
  ...pack.categories.flatMap((cat: Raw) => cat.cards.map((c: Raw) => toCard(c, cat.id))),
]
const byId = new Map(cards.map((c) => [c.id, c]))
const byLabel = (label: string) => {
  // a song's copy of a word («ак», «күзгү») only when there is no ordinary card for it
  const ordinary = cards.filter((x) => x.role !== 'verbatim')
  const c = vocab.categories.flatMap((cat: Raw) => cat.cards).find((x: Raw) => x.label === label && x.role !== 'verbatim')
  return byId.get(c?.id ?? '') ?? ordinary.find((x) => x.label === label) ?? cards.find((x) => x.label === label)
}
const AND = { id: '_and', label: 'жана', type: 'social', categoryId: '_', image: '', audioSource: 'suylo', builtin: true, hidden: false } as Card
const WITH = { ...AND, id: '_with', label: 'менен' } as Card
const helpers = { and: AND, with: WITH, lookup: (id: string) => byId.get(id) }
const say = (...labels: string[]) =>
  sentenceText(buildSentence(labels.map((l, i) => ({ key: i + 1, card: byLabel(l)! })), helpers, 'guess'))

// ---------------------------------------------------------------- golden sentences
const golden: [string[], string][] = [
  // the user's examples
  [['мен', 'суу', 'гамбургер'], 'Мен суу жана гамбургер каалайм.'],
  [['мен', 'суу', 'жегим келип жатат'], 'Мен суу ичким келип жатат.'],
  [['мен', 'жегим келип жатат'], 'Мен жегим келип жатат.'],
  // desire keeps plain «мен» (spoken Kyrgyz: «Мен сени көргүм келип жатат»)
  [['мен', 'ичким келип жатат', 'суу'], 'Мен суу ичким келип жатат.'],
  [['уктагым келип жатат', 'мен'], 'Мен уктагым келип жатат.'],
  [['мен', 'үйгө'], 'Мен үйгө баргым келип жатат.'],
  [['ажатканага баргым келип жатат', 'мен'], 'Мен ажатканага баргым келип жатат.'],
  // the word itself says "my" → «менин»
  [['мен', 'башым ооруп жатат'], 'Менин башым ооруп жатат.'],
  [['мен', 'курсагым ачты'], 'Менин курсагым ачты.'],
  [['уйкум келди', 'мен'], 'Менин уйкум келди.'],
  // dative «мага» (Peace Corps: «Мага тоолор жагат», «Мага эт жакпайт»; «Мага нан керек»)
  [['мен', 'алма', 'жагат'], 'Мага алма жагат.'],
  [['жакпайт', 'эт', 'мен'], 'Мага эт жакпайт.'],
  [['мен', 'суу', 'керек'], 'Мага суу керек.'],
  [['апа', 'жардам бер', 'мен'], 'Апа, мага жардам бер.'],
  [['апа', 'мен', 'суу', 'бер'], 'Апа, мага суу бер.'],
  // people get suffixes (мүчөлөр) from their verb
  [['мен', 'апа', 'каалайм'], 'Мен апамды каалайм.'],
  [['мен', 'апа', 'баргым келип жатат'], 'Мен апама баргым келип жатат.'],
  [['мен', 'апа', 'паркка', 'баргым келип жатат'], 'Мен апам менен паркка баргым келип жатат.'],
  [['мен', 'ата', 'ойногум келип жатат'], 'Мен атам менен ойногум келип жатат.'],
  [['мен', 'чоң апа', 'жагат'], 'Мага чоң апам жагат.'],
  [['мен', 'апа', 'керек'], 'Мага апам керек.'],
  [['мен', 'бөбөк', 'көргүм келип жатат'], 'Мен бөбөгүмдү көргүм келип жатат.'],
  [['дос', 'мен', 'топ', 'ойногум келип жатат'], 'Мен досум менен топ ойногум келип жатат.'],
  [['кучактагым келип жатат', 'апа', 'мен'], 'Мен апамды кучактагым келип жатат.'],
  // otherwise people are being spoken to
  [['апа', 'мен', 'суу', 'ичким келип жатат'], 'Апа, мен суу ичким келип жатат.'],
  [['апа', 'мен', 'алма', 'каалайм'], 'Апа, мен алма каалайм.'],
  [['апа', 'кайда'], 'Апа кайда?'],
  [['мен', 'капамын'], 'Мен капамын.'],
  [['мен', 'алма', 'каалайм'], 'Мен алма каалайм.'],
  [['ат', 'мен', 'каалайм'], 'Мен ат каалайм.'],
  // eat vs drink, and two foods of different kinds
  [['нан', 'ичким келип жатат'], 'Нан жегим келип жатат.'],
  [['мен', 'суу', 'нан', 'жегим келип жатат'], 'Мен суу ичким келип жатат жана нан жегим келип жатат.'],
  // words that have nothing to do with the tapped verb are left out (shown crossed out)
  [['мен', 'ойногум келип жатат', 'топ', 'китеп'], 'Мен топ ойногум келип жатат.'],
  [['мен', 'капамын', 'топ', 'китеп'], 'Мен капамын.'],
  [['алма', 'сүзгүм келип жатат'], 'Сүзгүм келип жатат.'],
  [['мен', 'алма', 'уктагым келип жатат'], 'Мен уктагым келип жатат.'],
  [['мен', 'курсагым ачты', 'нан'], 'Менин курсагым ачты жана нан жегим келип жатат.'],
  // a verb with nothing to go with it gets «бир нерсе»
  [['мен', 'каалайм', 'бер'], 'Мен бир нерсени каалайм жана мага бир нерсени бер.'],
  [['мен', 'каалайм'], 'Мен бир нерсени каалайм.'],
  [['апа', 'бер'], 'Апа, бир нерсени бер.'],
  [['мен', 'керек'], 'Мага бир нерсе керек.'],
  [['мен', 'жагат'], 'Мага жагат.'],
  [['мен', 'бир нерсе', 'каалайм'], 'Мен бир нерсени каалайм.'],
  [['мен', 'апа', 'бер'], 'Апа, мага бир нерсени бер.'],
  [['мен', 'суу', 'ичким келип жатат', 'бер'], 'Мен суу ичким келип жатат жана мага бир нерсени бер.'],
  // general words
  [['мен', 'тамак', 'жегим келип жатат'], 'Мен тамак жегим келип жатат.'],
  [['мен', 'үй-бүлө', 'ойногум келип жатат'], 'Мен үй-бүлөм менен ойногум келип жатат.'],
  [['мен', 'бир жерге'], 'Мен бир жерге баргым келип жатат.'],
  [['мен', 'бир жерим ооруп жатат'], 'Менин бир жерим ооруп жатат.'],
  [['мен', 'оюн', 'ойногум келип жатат'], 'Мен оюн ойногум келип жатат.'],
  [['мен', 'кийим', 'кийгим келип жатат'], 'Мен кийим кийгим келип жатат.'],
  // a verb that does not fit the thing is corrected to the thing's own verb
  [['мен', 'машина', 'ичким келип жатат'], 'Мен машина айдагым келип жатат.'],
  [['мен', 'велосипед', 'ойногум келип жатат'], 'Мен велосипед тепким келип жатат.'],
  [['мен', 'көйнөк', 'жегим келип жатат'], 'Мен көйнөк кийгим келип жатат.'],
  [['мен', 'музыка', 'көргүм келип жатат'], 'Мен музыка уккум келип жатат.'],
  [['мен', 'китеп', 'ичким келип жатат'], 'Мен китеп окугум келип жатат.'],
  [['мен', 'мультфильм', 'ойногум келип жатат'], 'Мен мультфильм көргүм келип жатат.'],
  [['мен', 'мышык', 'жегим келип жатат'], 'Мен мышык көргүм келип жатат.'],
  [['мен', 'суу', 'машина', 'ичким келип жатат'], 'Мен суу ичким келип жатат.'],
  [['мен', 'алма', 'машина', 'көйнөк', 'жегим келип жатат'], 'Мен алма жегим келип жатат.'],
  // the verb gives the thing its ending
  [['мен', 'топ', 'ойногум келип жатат'], 'Мен топ ойногум келип жатат.'],
  [['мен', 'телефон', 'ойногум келип жатат'], 'Мен телефон ойногум келип жатат.'],
  [['мен', 'оюнчук', 'ойногум келип жатат'], 'Мен оюнчук менен ойногум келип жатат.'],
  [['мен', 'мышык', 'ит', 'ойногум келип жатат'], 'Мен мышык жана ит менен ойногум келип жатат.'],
  [['мен', 'мышык', 'кучактагым келип жатат'], 'Мен мышыкты кучактагым келип жатат.'],
  [['апа', 'мен', 'ит', 'кучактагым келип жатат'], 'Апа, мен итти кучактагым келип жатат.'],
  [['мен', 'машина', 'үйгө'], 'Мен машина менен үйгө баргым келип жатат.'],
  [['мен', 'дос', 'велосипед', 'тепким келип жатат'], 'Мен досум менен велосипед тепким келип жатат.'],
  // a verb with nothing tapped for it
  [['мен', 'тепким келип жатат'], 'Мен велосипед тепким келип жатат.'],
  [['мен', 'айдагым келип жатат'], 'Мен машина айдагым келип жатат.'],
  [['мен', 'кийгим келип жатат'], 'Мен кийингим келип жатат.'],
  [['мен', 'шым', 'кийгим келип жатат'], 'Мен шым кийгим келип жатат.'],
  // big dictionary
  [['мен', 'автобус', 'түшкүм келип жатат'], 'Мен автобуска түшкүм келип жатат.'],
  [['мен', 'учак', 'жегим келип жатат'], 'Мен учакка түшкүм келип жатат.'],
  [['мен', 'мектеп автобусу', 'түшкүм келип жатат'], 'Мен мектеп автобусуна түшкүм келип жатат.'],
  [['мен', 'самокат', 'ойногум келип жатат'], 'Мен самокат тепким келип жатат.'],
  [['мен', 'ат', 'мингим келип жатат'], 'Мен ат мингим келип жатат.'],
  [['мен', 'көз'], 'Менин көзүм ооруп жатат.'],
  [['мен', 'мурун', 'ооруп жатат'], 'Менин мурдум ооруп жатат.'],
  [['мен', 'курсак'], 'Менин ичим ооруп жатат.'],
  [['мен', 'ичим ооруп жатат'], 'Менин ичим ооруп жатат.'],
  [['мен', 'тиш', 'кулак', 'ооруп жатат'], 'Менин тишим жана кулагым ооруп жатат.'],
  [['мен', 'кол', 'жуугум келип жатат'], 'Мен колумду жуугум келип жатат.'],
  [['мен', 'окуу'], 'Мен окугум келип жатат.'],
  [['мен', 'бий'], 'Мен бийлегим келип жатат.'],
  [['мен', 'окуу', 'жагат'], 'Мага окуу жагат.'],
  [['мен', 'эшик', 'ач'], 'Мага эшикти ач.'],
  [['мен', 'дары', 'жегим келип жатат'], 'Мен дары ичким келип жатат.'],
  [['мен', 'окуу китеби', 'окугум келип жатат'], 'Мен окуу китебин окугум келип жатат.'],
  [['мен', 'Нооруз'], 'Мага Нооруз жагат.'],
  [['мен', 'футбол', 'ойногум келип жатат'], 'Мен футбол ойногум келип жатат.'],
  [['мен', 'гитара', 'ичким келип жатат'], 'Мен гитара уккум келип жатат.'],
  [['мен', 'сен', 'суу'], 'Мен суу каалайм.'],
  [['сен'], 'Сен.'],
  // «сен» and the others take endings like people
  [['мен', 'сен', 'жакшы көрөм'], 'Мен сени жакшы көрөм.'],
  [['мен', 'сен', 'жагат'], 'Мен сени жакшы көрөм.'],
  [['мен', 'жакшы көрөм'], 'Мен сени жакшы көрөм.'],
  [['мен', 'апа', 'жакшы көрөм'], 'Мен апамды жакшы көрөм.'],
  [['мен', 'алма', 'жакшы көрөм'], 'Мага алма жагат.'],
  [['мен', 'сен', 'керек'], 'Мага сен керексиң.'],
  [['мен', 'сен', 'жакпайт'], 'Мага сен жакпайсың.'],
  [['мен', 'сен', 'ойногум келип жатат'], 'Мен сени менен ойногум келип жатат.'],
  [['мен', 'сен', 'баргым келип жатат'], 'Мен сага баргым келип жатат.'],
  [['мен', 'кучактагым келип жатат'], 'Мен сени кучактагым келип жатат.'],
  [['мен', 'ал', 'керек'], 'Мага ал керек.'],
  [['мен', 'алар', 'ойногум келип жатат'], 'Мен алар менен ойногум келип жатат.'],
  [['мен', 'сен'], 'Мен жана сен.'],
  [['мен', 'бул эмне'], 'Бул эмне?'],
  [['мен', 'космонавт', 'ойногум келип жатат'], 'Мен космонавт менен ойногум келип жатат.'],
  [['апа', 'куту', 'кайда'], 'Апа, куту кайда?'],
  [['кайда', 'бир аз'], 'Кайда?'],
  [['мен', 'таттуу', 'алма', 'каалайм'], 'Мен таттуу алма каалайм.'],
  [['мен', 'чийки', 'күн'], 'Мен күн каалайм.'],
  [['мен', 'кызыл', 'дагы', 'топ', 'каалайм'], 'Мен дагы кызыл топ каалайм.'],
  [['мен', 'ооруп жатат'], 'Менин бир жерим ооруп жатат.'],
  [['мен', 'көз', 'ойногум келип жатат'], 'Мен ойногум келип жатат.'],
  [['мен', 'көз', 'каалайм'], 'Менин көзүм ооруп жатат.'],
  [['мен', 'бир нерсе', 'жегим келип жатат'], 'Мен бир нерсени жегим келип жатат.'],
  [['мен', 'спорт залы'], 'Мен спорт залына баргым келип жатат.'],
  // famous people: no "my"
  [['мен', 'Бегиш', 'жагат'], 'Мага Бегиш жагат.'],
  [['мен', 'Бакр', 'уккум келип жатат'], 'Мен Бакрды уккум келип жатат.'],
  [['мен', 'Мистер Бист', 'көргүм келип жатат'], 'Мен Мистер Бистти көргүм келип жатат.'],
  [['мен', 'Чыңгыз Айтматов', 'жакшы көрөм'], 'Мен Чыңгыз Айтматовду жакшы көрөм.'],
  [['мен', 'Месси', 'ойногум келип жатат'], 'Мен Месси менен ойногум келип жатат.'],
  [['мен', 'Улукманапо', 'баргым келип жатат'], 'Мен Улукманапого баргым келип жатат.'],
  [['мен', 'уккум келип жатат'], 'Мен музыка уккум келип жатат.'],
  // everyday words
  [['мен', 'кат', 'жазгым келип жатат'], 'Мен кат жазгым келип жатат.'],
  [['мен', 'адашып калдым'], 'Мен адашып калдым.'],
  [['мен', 'ойгондум'], 'Мен ойгондум.'],
  [['мен', 'керемет', 'шамчырак', 'каалайм'], 'Мен керемет шамчырак каалайм.'],
  [['мен', 'жаш', 'мышык', 'көргүм келип жатат'], 'Мен жаш мышык көргүм келип жатат.'],
  // plain verbs get their ending automatically
  [['мен', 'сүзүү'], 'Мен сүзгүм келип жатат.'],
  [['мен', 'уялуу'], 'Мен уялып жатам.'],
  [['мен', 'апа', 'ойноо'], 'Мен апам менен ойногум келип жатат.'],
  [['мен', 'суу', 'ичүү'], 'Мен суу ичким келип жатат.'],
  [['мен', 'сүзүү', 'жагат'], 'Мага сүзүү жагат.'],
  [['сүзүү'], 'Сүзүү.'],
  [['нан', 'ичүү'], 'Нан жегим келип жатат.'],
  [['суу', 'ичүү'], 'Суу ичким келип жатат.'],
  [['апа', 'ойноо'], 'Апам менен ойногум келип жатат.'],
  [['машина', 'ичүү'], 'Машина айдагым келип жатат.'],
  [['рахмат', 'сүзүү'], 'Рахмат, сүзгүм келип жатат.'],
  // мүчөлөр tapped after a word join it, in the right variant
  [['алма', '-га'], 'Алмага.'],
  [['китеп', '-лар'], 'Китептер.'],
  [['топ', '-м'], 'Тобум.'],
  [['үй-бүлө', '-м', '-га'], 'Үй-бүлөмө.'],
  [['мен', '-га'], 'Мага.'],
  [['сен', '-ны'], 'Сени.'],
  [['суу', '-сыз'], 'Суусуз.'],
  [['туз', '-луу'], 'Туздуу.'],
  [['ыр', '-чы'], 'Ырчы.'],
  [['Бүбүсара Бейшеналиева', '-дай'], 'Бүбүсара Бейшеналиевадай.'],
  [['мен', 'сүзүү', '-дым'], 'Мен сүздүм.'],
  [['мен', 'сүзгүм келип жатат', '-ып жатам'], 'Мен сүзүп жатам.'],
  [['мен', 'суу', 'ичүү', '-дым'], 'Мен суу ичтим.'],
  [['мен', 'угуу', '-ып жатам'], 'Мен угуп жатам.'],
  [['бер', '-чы'], 'Берчи.'],
  [['ойноо', '-алы'], 'Ойнойлу.'],
  [['ичүү', '-ба'], 'Ичпе.'],
  [['мен', 'үйгө', 'баруу', '-дым'], 'Мен үйгө бардым.'],
  [['алма', '-дым'], 'Алма.'],
  [['жалган', '-бы'], 'Жалганбы?'],
  // the verb agrees with who it is about: мен, сен, ал, биз, алар
  [['сен', 'сүзгүм келип жатат'], 'Сен сүзгүң келип жатат.'],
  [['ал', 'сүзүү'], 'Ал сүзгүсү келип жатат.'],
  [['биз', 'ойногум келип жатат'], 'Биз ойногубуз келип жатат.'],
  [['алар', 'коркуп жатам'], 'Алар коркуп жатышат.'],
  [['сен', 'капамын'], 'Сен капасың.'],
  [['ал', 'чарчадым'], 'Ал чарчады.'],
  [['биз', 'чарчадым'], 'Биз чарчадык.'],
  [['сен', 'суу', 'каалайм'], 'Сен суу каалайсың.'],
  [['сен', 'алма'], 'Сен алма каалайсың.'],
  [['ал', 'башым ооруп жатат'], 'Анын башы ооруп жатат.'],
  [['сен', 'курсагым ачты'], 'Сенин курсагың ачты.'],
  [['сен', 'колумду жуугум келип жатат'], 'Сен колуңду жуугуң келип жатат.'],
  [['ал', 'алма', 'жагат'], 'Ага алма жагат.'],
  [['биз', 'алма', 'керек'], 'Бизге алма керек.'],
  [['ал', 'мен', 'жакшы көрөм'], 'Мен аны жакшы көрөм.'],
  [['сен', 'жакшы көрөм'], 'Сен жакшы көрөсүң.'],
  [['ал', 'апа', 'ойногум келип жатат'], 'Ал апам менен ойногусу келип жатат.'],
  [['сен', 'үйгө'], 'Сен үйгө баргың келип жатат.'],
  [['сен', 'суу', 'нан', 'жегим келип жатат'], 'Сен суу ичкиң келип жатат жана нан жегиң келип жатат.'],
  [['биз', 'сүзүү', '-дым'], 'Биз сүздүк.'],
  [['сен', 'суу', 'ичүү', '-ып жатам'], 'Сен суу ичип жатасың.'],
  [['алар', 'көз'], 'Алардын көзү ооруп жатат.'],
  [['сен', 'бер', 'суу'], 'Сен мага суу бер.'],
  [['сен', 'жардам бер'], 'Сен мага жардам бер.'],
  [['сен', 'бер'], 'Сен мага бир нерсени бер.'],
  [['ал', 'кучактагым келип жатат'], 'Ал кучактагысы келип жатат.'],
  [['ал', 'бер', 'суу'], 'Ага суу бер.'],
  [['сен', 'жакшы көрөм', 'апа'], 'Сен апамды жакшы көрөсүң.'],
  [['биз', 'жакшы көрөм'], 'Биз сени жакшы көрөбүз.'],
  [['кызыл'], 'Кызыл.'],
  // lists, describing words, numbers
  [['суу', 'нан', 'алма'], 'Суу, нан жана алма.'],
  [['мен', 'дагы', 'суу', 'каалайм'], 'Мен дагы суу каалайм.'],
  [['алма', 'эки', 'мен'], 'Мен эки алма каалайм.'],
  [['кызыл', 'топ', 'ойногум келип жатат'], 'Кызыл топ ойногум келип жатат.'],
  // greetings and people go first
  [['салам', 'апа'], 'Салам, апа.'],
  [['рахмат', 'ата', 'мен', 'суу'], 'Рахмат, ата, мен суу каалайм.'],
  [['мен', 'капамын', 'алма'], 'Мен капамын.'],
  [['суу', 'суу', 'суу'], 'Суу.'],
  [['мен', 'мен', 'жагат', 'алма'], 'Мага алма жагат.'],
  [['мектепке'], 'Мектепке.'],
  [['мен', 'мектепке', 'паркка'], 'Мен мектепке жана паркка баргым келип жатат.'],
  [['мен', 'абдан', 'капамын'], 'Мен абдан капамын.'],
  [['суу', 'кайда'], 'Суу кайда?'],
  // colours only describe things; «дагы» describes things or verbs
  [['мен', 'кызыл', 'ойногум келип жатат', 'топ'], 'Мен кызыл топ ойногум келип жатат.'],
  [['мен', 'дагы', 'ойногум келип жатат'], 'Мен дагы ойногум келип жатат.'],
]

let fail = 0
for (const [taps, expected] of golden) {
  const got = say(...taps)
  if (got !== expected) {
    fail++
    console.log(`✗ ${taps.join(' + ')}\n    got:      ${got}\n    expected: ${expected}`)
  }
}
console.log(`golden: ${golden.length - fail}/${golden.length} correct`)

/** The form a thing should take with this verb (see TAKES in grammar.ts), for the sentence's person. */
function formFor(verb: Card, thing: Card, all: Token[], pers: Person = '1s') {
  const k = fit(verb, thing)!
  if (pers !== '1s' && k === 'poss') return possessive(thing.label, pers) // «Сенин көзүң ооруп жатат»
  if (pers !== '1s' && k === 'possAcc') return possessiveObject(thing.label, pers)
  const withMenen = all.some((t) => fit(verb, byId.get(t.card.id)!) === 'com')
  if (withMenen) return thing.label
  if (k === '') return (verb.takes !== 'about' && thing.forms?.obj?.label) || thing.label
  return thing.forms![k]!.label
}

// ---------------------------------------------------------------- every thing × every verb
// «мен» + a thing + a verb, for all things and all verbs that take things (default deck and big dictionary):
// the thing ends up with a verb that fits it, in that verb's form, and a verb that fits is never changed.
const nouns = cards.filter((c) => roleOf(c) === 'object' && !c.use && !c.auto && c.role !== 'verbatim')
const verbs = cards.filter((c) => roleOf(c) === 'pred' && (c.takes || c.frame === 'obj') && c.role !== 'verbatim')
let pairs = 0
const pairProblems = new Map<string, string[]>()
const pairFlag = (rule: string, text: string) => {
  const l = pairProblems.get(rule) ?? []
  if (l.length < 4) l.push(text)
  pairProblems.set(rule, l)
}
const me = byLabel('мен')!
for (const n of nouns) {
  for (const v of verbs) {
    pairs++
    const toks = buildSentence([{ key: 1, card: me }, { key: 2, card: n }, { key: 3, card: v }], helpers, 'guess')
    const text = sentenceText(toks)
    const i = toks.findIndex((t) => t.key === '2')
    const verbTok = toks.slice(i).find((t) => roleOf(t.card) === 'pred' && !t.dropped)
    if (i < 0) pairFlag('thing lost', text)
    else if (toks[i].dropped) {
      if (fit(v, n) !== undefined) pairFlag('a thing that fits was left out', text)
      if (!toks.some((t) => t.key === '3' && (t.card.id === v.id || t.card.id === v.bare))) pairFlag('left out a thing but changed the verb', text)
    } else if (!verbTok) pairFlag('thing has no verb', text)
    else {
      const used = verbTok.card
      if (fit(used, n) === undefined) pairFlag(`${kindsOf(n).join('/')} with «${used.label}»`, text)
      else if (toks[i].card.label !== formFor(used, n, [toks[i]])) pairFlag('wrong form', text)
      if (fit(v, n) !== undefined && used.id !== v.id) pairFlag('a verb that fits was changed', text)
    }
  }
}
// every rule's endings exist for every thing that needs them
for (const n of nouns)
  for (const [rule, takes] of Object.entries(TAKES))
    for (const k of kindsOf(n)) {
      const c = takes[k]
      if (c && c !== 'com' && !n.forms?.[c]) pairFlag(`missing form «${c}» for «${rule}»`, n.label)
    }
console.log(`every thing × every verb: ${nouns.length} things × ${verbs.length} verbs = ${pairs} sentences, ${pairProblems.size} kinds of problem`)
for (const [rule, ex] of pairProblems) console.log(`  ✗ ${rule}:\n      ${ex.join('\n      ')}`)

// ---------------------------------------------------------------- fuzz: random taps are always well-formed
const pool = cards.filter((c, i) => c.role !== 'verbatim' && c.role !== 'suffix' && (!c.categoryId.startsWith('pk-') || i % 5 < 2)) // the same 40% of the dictionary every run
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const problems = new Map<string, string[]>()
const flag = (rule: string, text: string) => {
  const l = problems.get(rule) ?? []
  if (l.length < 3) l.push(text)
  problems.set(rule, l)
}
const RUNS = 20000
for (let r = 0; r < RUNS; r++) {
  const n = 1 + Math.floor(rand() * 6)
  const taps = Array.from({ length: n }, (_, i) => ({ key: i + 1, card: pool[Math.floor(rand() * pool.length)] }))
  const all: Token[] = buildSentence(taps, helpers, 'guess')
  const text = sentenceText(all)
  const toks = all.filter((t) => !t.dropped)
  // a word is only left out when no tapped verb takes it
  for (const d of all.filter((t) => t.dropped && roleOf(t.card) === 'object'))
    if (all.some((t) => !t.auto && !t.dropped && roleOf(t.card) === 'pred' && fit(t.card, d.card) !== undefined)) flag('a word that fits was left out', text)
  // every tapped word is still there (possibly inflected / swapped for its pair)
  const kept = new Set(all.filter((t) => !t.auto || /^\d+$/.test(t.key)).map((t) => t.key))
  // («мен» said once: extra «мен»/«мага»/«менин» cards are merged into one subject)
  const firstMe = taps.find((t) => t.card.role === 'me')
  const uniqueTaps = taps.filter((t, i) => taps.findIndex((u) => u.card.id === t.card.id) === i && (t.card.role !== 'me' || t === firstMe))
  if (uniqueTaps.some((t) => !kept.has(String(t.key)))) flag('a tapped word was lost', text)
  // split into sentences
  const sentences: Token[][] = [[]]
  toks.forEach((t) => {
    sentences[sentences.length - 1].push(t)
    if (t.punct === '.' || t.punct === '?') sentences.push([])
  })
  for (const s of sentences.filter((x) => x.length)) {
    const st = sentenceText(s)
    const roles = s.map((t) => roleOf(t.card))
    // a sentence with a verb ends with a verb (or a question word before it)
    if (roles.includes('pred') && roles[roles.length - 1] !== 'pred') flag('verb is not last', st)
    // «мен» at most once in each form («Мен … каалайм жана мага … бер» is fine)
    const meForms = s.filter((t) => roleOf(t.card) === 'me').map((t) => t.card.label)
    if (new Set(meForms).size < meForms.length) flag('«мен» twice', st)
    // «мен» in the case its verb needs
    s.forEach((meTok, i) => {
      if (roleOf(meTok.card) !== 'me') return
      const pred = s.slice(i).find((t) => roleOf(t.card) === 'pred')
      if (!pred) return
      const want = pred.card.subject ? (byLabel('мен')!.forms as any)[pred.card.subject].label : 'мен'
      if (meTok.card.label !== want) flag(`«мен» should be «${want}» with «${pred.card.label}»`, st)
    })
    // postpositions («ичинде») and «абдан» never stand right before a thing
    s.forEach((t, i) => {
      const next = s[i + 1]
      if (!next || t.punct) return
      const nextRole = roleOf(next.card)
      if (t.card.role === 'alone' && (nextRole === 'object' || nextRole === 'place')) flag('postposition before a noun', st)
      if (t.card.role === 'adverb' && (nextRole === 'object' || nextRole === 'place')) flag('«абдан» before a noun', st)
      if (roleOf(t.card) === 'describe' && !t.card.role && nextRole === 'pred') flag('colour/size word before a verb', st)
    })
    // «жана» only between things
    s.forEach((t, i) => {
      if (t.card.id !== '_and') return
      if (i === 0 || i === s.length - 1) flag('«жана» at the edge', st)
      if (s[i + 1]?.card.id === '_and') flag('«жана жана»', st)
    })
    // every thing goes with its verb, in the form that verb gives it (and «my» follows who it is about)
    const subjectTok = s.find((t) => t.card.pers && !t.auto) // (an added «сени» is who it is done to)
    const sentencePers = (subjectTok && s.indexOf(subjectTok) < s.findIndex((t) => roleOf(t.card) === 'pred') ? subjectTok.card.pers : '1s') as Person
    let things: Token[] = []
    for (const t of s) {
      const role = roleOf(t.card)
      if (role === 'object' && !t.card.use) things.push(t)
      if (role !== 'pred') continue
      for (const th of things) {
        const original = byId.get(th.card.id)!
        if (fit(t.card, original) === undefined) flag(`«${original.label}» does not go with «${t.card.label}»`, st)
        else if (th.card.label !== formFor(t.card, original, things, sentencePers)) flag(`«${th.card.label}» should be «${formFor(t.card, original, things, sentencePers)}» with «${t.card.label}»`, st)
      }
      things = []
    }
  }
}
console.log(`fuzz: ${RUNS} random sentences, ${problems.size} kinds of problem`)
for (const [rule, ex] of problems) console.log(`  ✗ ${rule}:\n      ${ex.join('\n      ')}`)

console.log('\nsamples:')
for (let r = 0; r < 25; r++) {
  const n = 2 + Math.floor(rand() * 4)
  const taps = Array.from({ length: n }, (_, i) => ({ key: i + 1, card: pool[Math.floor(rand() * pool.length)] }))
  console.log(`  ${taps.map((t) => t.card.label).join(' + ')}\n    → ${sentenceText(buildSentence(taps, helpers, 'guess'))}`)
}
// ---------------------------------------------------------------- search: Kyrgyz, Russian keyboard, Latin
const { searchCards } = await import('../src/lib/search.ts')
const library = [{ id: 'all', label: '', icon: '', cards, builtin: true, hidden: false }]
let searchFail = 0
for (const [typed, expected] of [['суу', 'суу'], ['jakshy korom', 'жакшы көрөм'], ['уй було', 'үй-бүлө'], ['oiunchuk', 'оюнчук'], ['chyngyz', 'Чыңгыз Айтматов'], ['zhegim', 'жегим келип жатат']]) {
  const top = searchCards(library, typed).slice(0, 3).map((c) => c.label)
  if (!top.includes(expected)) {
    searchFail++
    console.log(`✗ search «${typed}» → «${top.join(', ')}», expected «${expected}» near the top`)
  }
}
console.log(`search: ${6 - searchFail}/6 found near the top`)

// ---------------------------------------------------------------- 'off' (what the app does): exactly as tapped
const sayOff = (...labels: string[]) =>
  sentenceText(buildSentence(labels.map((l, i) => ({ key: i + 1, card: byLabel(l)! })), helpers, 'off'))
const offGolden: [string[], string][] = [
  [['мен', 'суу', 'ичким келип жатат'], 'Мен суу ичким келип жатат.'],
  [['мен', 'машина', 'ичким келип жатат'], 'Мен машина ичким келип жатат.'],
  [['апа', 'кайда'], 'Апа кайда?'],
  [['бул', 'эмне'], 'Бул эмне?'],
  [['суу', 'мен'], 'Суу мен.'],
  [['алма', '-га'], 'Алмага.'],
  [['мен', 'сен', 'жакшы көрөм'], 'Мен сен жакшы көрөм.'],
]
let offFail = 0
for (const [taps, expected] of offGolden) {
  const got = sayOff(...taps)
  if (got !== expected) {
    offFail++
    console.log(`✗ off: ${taps.join(' + ')}\n    got:      ${got}\n    expected: ${expected}`)
  }
}
console.log(`as tapped: ${offGolden.length - offFail}/${offGolden.length} correct`)

// ---------------------------------------------------------------- 'form' mode: the child's words, never changed
// Endings, order and agreement are fixed; no word is swapped, left out or added (only «жана», «менен» join them).
const sayForm = (...labels: string[]) =>
  sentenceText(buildSentence(labels.map((l, i) => ({ key: i + 1, card: byLabel(l)! })), helpers, 'form'))
const formGolden: [string[], string][] = [
  [['мен', 'машина', 'ичким келип жатат'], 'Мен машина ичким келип жатат.'],
  [['мен', 'апа', 'баргым келип жатат'], 'Мен апама баргым келип жатат.'],
  [['мен', 'сен', 'жакшы көрөм'], 'Мен сени жакшы көрөм.'],
  [['мен', 'сен', 'жагат'], 'Мен сени жакшы көрөм.'],
  [['мен', 'суу'], 'Мен суу.'],
  [['алма', 'сүзгүм келип жатат'], 'Алма, сүзгүм келип жатат.'], // no verb for it: named first, not made its object
  [['мен', 'телефон', 'капамын'], 'Телефон, мен капамын.'],
  [['мен', 'дагы'], 'Мен дагы.'],
  [['ата', 'дагы'], 'Ата, дагы.'],
  [['мен', 'бул', 'каалайм'], 'Мен муну каалайм.'],
  [['бул', 'ач'], 'Муну ач.'],
  [['эмне', 'бул'], 'Бул эмне?'],
  [['мен', 'сыртка', 'ойногум келип жатат'], 'Мен сыртта ойногум келип жатат.'],
  [['мен', 'сыртка', 'баргым келип жатат'], 'Мен сыртка баргым келип жатат.'],
  [['сен', 'суу', 'бер'], 'Сен суу бер.'],
  [['апа', 'суу', 'бер'], 'Апа, суу бер.'],
  [['мен', 'жагат', 'алма'], 'Мага алма жагат.'],
  [['мен', 'башым ооруп жатат'], 'Менин башым ооруп жатат.'],
  [['мен', 'апа', 'ойногум келип жатат'], 'Мен апам менен ойногум келип жатат.'],
  [['жакшы көрөм'], 'Жакшы көрөм.'],
  [['каалайм'], 'Каалайм.'],
  [['ата', 'жардам бер'], 'Ата, жардам бер.'],
  [['мен', 'нан', 'жегим келип жатат'], 'Мен нан жегим келип жатат.'],
]
let formFail = 0
for (const [taps, expected] of formGolden) {
  const got = sayForm(...taps)
  if (got !== expected) {
    formFail++
    console.log(`✗ form: ${taps.join(' + ')}\n    got:      ${got}\n    expected: ${expected}`)
  }
}
console.log(`form golden: ${formGolden.length - formFail}/${formGolden.length} correct`)

// Random taps of the simple boards' words (and of everything): every tapped word is said, as itself (in some
// form), and nothing but «жана»/«менен» or the child's own «мен» again («мага») is added.
const board = JSON.parse(readFileSync(new URL('../src/data/board.json', import.meta.url), 'utf8'))
const simpleIds: string[] = board.boards.flatMap((b: Raw) => b.slots).filter(Boolean)
const simple = simpleIds.map((id) => byId.get(id)!)
const formProblems = new Map<string, string[]>()
const formFlag = (rule: string, text: string) => {
  const ex = formProblems.get(rule) ?? []
  if (ex.length < 3) ex.push(text)
  formProblems.set(rule, ex)
}
const FORM_RUNS = 20000
for (let r = 0; r < FORM_RUNS; r++) {
  const from = r % 2 ? simple : pool
  const n = 1 + Math.floor(rand() * 4)
  const taps = Array.from({ length: n }, (_, i) => ({ key: i + 1, card: from[Math.floor(rand() * from.length)] }))
  const toks = buildSentence(taps, helpers, 'form')
  const text = `${taps.map((t) => t.card.label).join(' + ')} → ${sentenceText(toks)}`
  if (toks.some((t) => t.dropped && t.card.role !== 'suffix')) formFlag('a word was left out', text)
  const seen = new Set<string>()
  for (const t of taps) {
    if (t.card.role === 'suffix' || seen.has(t.card.id)) continue
    seen.add(t.card.id)
    const tok = toks.find((x) => x.key === String(t.key) || x.keys?.includes(String(t.key)))
    if (!tok) {
      formFlag('a tapped word is missing', text)
      continue
    }
    const c = t.card
    // its own forms: the verb of a base word («кийүү» → «кийгим»), said complete («кийингим»), «жагат» ↔ «жакшы көрөм»
    const own = [c.use, c.alt, c.personAlt, c.bare].filter(Boolean) as string[]
    const forms = new Set([c.id, ...own, ...own.flatMap((id) => { const v = byId.get(id); return [v?.bare, v?.alt, v?.personAlt] })])
    // «мага», «мени» are «мен» in another case: said in the case the verb needs
    const same = forms.has(tok.card.id) || tok.card.joined || (c.role === 'me' && tok.card.role === 'me')
    if (!same) formFlag(`a word was swapped («${c.label}» → «${tok.card.label}»)`, text)
  }
  const tappedIds = new Set(taps.map((t) => t.card.id))
  const meIds = new Set([...taps.filter((t) => t.card.role === 'me' || t.card.pers).map((t) => t.card.id), 'me'])
  for (const t of toks)
    if (t.auto && t.card.id !== '_and' && t.card.id !== '_with' && !tappedIds.has(t.card.id) && !meIds.has(t.card.id))
      formFlag(`a word was added («${t.card.label}»)`, text)
}
console.log(`form fuzz: ${FORM_RUNS} random sentences, ${formProblems.size} kinds of problem`)
for (const [rule, ex] of formProblems) console.log(`  ✗ ${rule}:\n      ${ex.join('\n      ')}`)

// Every word on the simple boards ships with its picture and both of Suylo's takes (mid-sentence and final).
const audioIds = new Set(JSON.parse(readFileSync(new URL('../src/data/audio.json', import.meta.url), 'utf8')).ids)
const vocabCards = new Map<string, Raw>(vocab.categories.flatMap((c: Raw) => c.cards).map((c: Raw) => [c.id, c]))
const missing = simpleIds.filter((id) => !vocabCards.get(id)?.img || !audioIds.has(id) || !audioIds.has(`${id}--mid`))
console.log(`simple boards: ${simpleIds.length} words, ${missing.length ? `✗ missing picture or voice: ${missing.join(', ')}` : 'every one has its picture and voice'}`)

process.exitCode = fail || offFail || problems.size || pairProblems.size || searchFail || formFail || formProblems.size || missing.length ? 1 : 0

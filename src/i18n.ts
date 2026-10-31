import type { CardSize, WordType } from './types'

// All interface text lives here so a native speaker can proofread it in one place.
export const t = {
  appName: 'Suylo',
  speak: 'Айт',
  backspace: 'Өчүрүү',
  clear: 'Тазалоо',
  greeting: 'Салам! Менин атым Сүйлө.',
  introStart: 'Баштайлы!',
  letsGo: 'Кеттик!',
  tapCards: 'сүрөттү бас',
  holdForSettings: 'Ата-энелер үчүн: басып кармап туруңуз',

  // Parent gate
  enterPin: 'PIN-кодду териңиз',
  createPin: 'Жаңы PIN-код ойлоп табыңыз',
  confirmPin: 'PIN-кодду кайра териңиз',
  pinMismatch: 'Коддор дал келбейт, кайра аракет кылыңыз',
  wrongPin: 'Туура эмес код',
  forgotPin: 'Кодду унуттуңузбу?',
  forgotPinQuestion: 'Ата-эне экениңизди тастыктаңыз:',
  forgotPinHint: 'Туура жооп берсеңиз, жаңы код коё аласыз',
  cancel: 'Жокко чыгаруу',

  // Settings shell
  forParents: 'Ата-энелер үчүн',
  back: 'Артка',
  tabLibrary: 'Китепкана',
  tabSettings: 'Жөндөөлөр',

  // Big dictionary (optional pack)
  packTitle: 'Кеңири сөздүк',
  packDesc: (words: number, mb: number) =>
    `${words} кошумча сөз, ${mb} МБ. Чоңураак балдар жана өспүрүмдөр үчүн: тамактар, жаныбарлар, мектеп, сезимдер, суроолор, даяр сүйлөмдөр жана башкалар.`,
  packNote: 'Демейки Сүйлө кичинекей балдар үчүн жөнөкөй бойдон калат. Бул сөздүктү каалаган убакта орнотуп же өчүрүп койсоңуз болот.',
  packInstall: 'Жүктөп орнотуу',
  packInstalling: (pct: number) => `Жүктөлүп жатат… ${pct}%`,
  packInstalled: (words: number) => `Орнотулду: ${words} сөз, интернетсиз да иштейт`,
  packRemove: 'Өчүрүү',
  packNeedsInternet: 'Орнотуу үчүн интернет керек',
  packFailed: 'Жүктөлбөй калды. Интернетти текшерип, кайра аракет кылыңыз.',
  packConfirmRemove: 'Кеңири сөздүк телефондон өчүрүлөт. Макулсузбу?',
  allCategories: 'Бардык категориялар',
  search: 'Сөз издөө',
  searchPlaceholder: 'Сөздү жаз: суу, апа, suu…',
  searchNone: 'Мындай сөз табылган жок',
  closeSearch: 'Издөөнү жабуу',
  voiceHeading: 'Сүйлөнүн үнү',
  voiceHint: 'Сүйлө кандай сүйлөйт: тезирээк же жайыраак, жоонураак же ичкерээк. Бардык сөздөргө колдонулат, интернетсиз да иштейт.',
  voiceSpeed: 'Ылдамдыгы',
  voiceSlow: 'жай',
  voiceFast: 'тез',
  voicePitch: 'Үнү',
  voiceLow: 'жоон',
  voiceHigh: 'ичке',
  voiceTry: 'Угуп көр',
  voicePresets: { normal: 'Кадимки', slow: 'Жай', fast: 'Тез', chick: 'Балапан', giant: 'Алп' },

  // Library
  categories: 'Категориялар',
  cardsCount: (n: number) => `${n} карточка`,
  newCategory: 'Жаңы категория',
  newCard: 'Жаңы карточка',
  hiddenBadge: 'Жашырылган',
  categoryName: 'Категориянын аты',
  hideCategory: 'Категорияны баладан жашыруу',
  deleteCategory: 'Категорияны өчүрүү',
  confirmDeleteCategory: 'Бул категория жана анын карточкалары өчүрүлөт. Макулсузбу?',

  // Card editor
  editCard: 'Карточканы өзгөртүү',
  picture: 'Сүрөт',
  takePhoto: 'Сүрөткө тартуу',
  fromGallery: 'Галереядан',
  restorePicture: 'Баштапкы сүрөт',
  word: 'Сөз',
  wordPlaceholder: 'Мисалы: алма',
  wordType: 'Сөздүн түрү',
  voice: 'Үн',
  voiceSuylo: 'Сүйлөнүн үнү',
  voiceParent: 'Сиздин үнүңүз',
  voiceNone: 'Үн жок — өз үнүңүздү жаздырыңыз',
  play: 'Угуу',
  record: 'Жаздыруу',
  stopRecording: 'Токтотуу',
  rerecord: 'Кайра жаздыруу',
  restoreVoice: 'Сүйлөнүн үнүнө кайтаруу',
  micDenied: 'Микрофонго уруксат берилген жок',
  hideCard: 'Баладан жашыруу',
  deleteCard: 'Карточканы өчүрүү',
  confirmDeleteCard: 'Бул карточка өчүрүлөт. Макулсузбу?',
  save: 'Сактоо',

  // General settings
  changePin: 'PIN-кодду өзгөртүү',
  colorCoding: 'Сөздөрдү түс менен белгилөө',
  colorCodingHint: 'Аракет — жашыл, нерсе — кызгылт сары, адам — сары (Фицджеральд ачкычы)',
  speakOnTap: 'Ар бир карточканы дароо айтуу',
  speakOnTapHint: 'Өчүк болсо, бала сүйлөм түзүп, Сүйлөнү басат',
  intro: 'Башталгыч анимация',
  soundEffects: 'Үн эффекттери',
  soundEffectsHint: 'Кээ бир балдар үнгө сезгич келет — керек болсо өчүрүп койсоңуз болот',
  cardSize: 'Карточканын өлчөмү',
  offlineReady: 'Интернетсиз иштөөгө даяр',
  offlinePending: 'Интернетсиз иштөө даярдалып жатат…',
  installHint: 'Телефондо: браузердин менюсунан «Башкы экранга кошуу» дегенди басыңыз',
  resetAll: 'Баарын баштапкы абалга кайтаруу',
  confirmReset: 'Бардык өзгөртүүлөр, сүрөттөр жана жаздыруулар өчүрүлөт. Макулсузбу?',
  privacy: 'Бардык маалымат ушул телефондо гана сакталат. Каттоо жок. Интернет болгондо сүйлөмдүн тексти гана Сүйлөнүн үн серверине үнгө айландыруу үчүн жиберилет; сервер аны сактабайт.',
  // Simple vocabulary: five fixed pages
  vocabTitle: 'Сөздөр',
  vocabSimple: 'Жөнөкөй',
  vocabSimpleHint: '56 негизги сөз, 5 баракта. Ар бир сөз өз ордунда турат жана жылбайт — бала аны тез табат.',
  vocabFull: 'Толук',
  vocabFullHint: 'Бардык темалар: 240 сөз жана чоң сөздүк менен 1 200дөн ашык.',
  boardsTitle: 'Барактар',
  boardsHint: 'Сөздү басып, аны өзгөртүңүз же ордуна башка сөз коюңуз. Бош орунга жаңы сөз кошсоңуз болот. Калган сөздөр ордунан жылбайт.',
  slotEdit: 'Карточканы өзгөртүү',
  slotReplace: 'Ордуна башка сөз коюу',
  slotClear: 'Орунду бош калтыруу',
  slotPickTitle: 'Сөз тандаңыз',
  slotPickHint: 'Издөө бардык сөздөрдөн табат (чоң сөздүк жүктөлгөн болсо, андан да).',
  slotNewWord: 'Жаңы сөз',
  boardReset: 'Бул баракты баштапкы абалга кайтаруу',
  confirmBoardReset: 'Бул барактагы өзгөртүүлөр жок болот. Улантасызбы?',
  emptySlot: 'Бош орун',
  // First-run walkthrough
  coach1Title: 'Сүрөттү басыңыз',
  coach1Text: 'Карточка жогорку тилкеге учуп барат. Бир нече сүрөттү катары менен басса болот.',
  coach2Title: 'Эми Сүйлөнү басыңыз',
  coach2Text: 'Сүйлө тилкедеги сөздөрдү кыргызча айтып берет.',
  coach3Title: 'Ата-энелер үчүн',
  coach3Text: 'Тиштүү дөңгөлөктү басып кармап турсаңыз, жөндөөлөр ачылат. Ал жерден сүрөттөрдү, сөздөрдү жана үндү өзгөртө аласыз.',
  coachSkip: 'Өткөрүп жиберүү',
  coachDone: 'Түшүндүм',

  // Parents' guide (Settings tab)
  settingsHeading: 'Жөндөөлөр',
  guideTitle: 'Сүйлөнү бала менен кантип колдонсо болот',
  guideIntro:
    'Бул кеңештер дүйнөдөгү белгилүү AAC колдонмолорунун (Proloquo2Go, LAMP, PECS) тажрыйбасына негизделген. Баарын бир күндө жасоонун кереги жок.',
  guideOpenFamily: 'Үй-бүлө карточкаларын ачуу',
  replayTutorial: 'Көрсөтмөнү кайра көрсөтүү',
  optionsHeading: 'Параметрлер',
  credits: 'Сүрөттөр: Microsoft Fluent Emoji (MIT). Үн: Ulutsoft / Мамлекеттик тил комиссиясы.',
}

export interface GuideTip {
  icon: string
  title: string
  text: string
  /** Optional shortcut, e.g. straight to the family cards. */
  action?: 'openFamily'
}

export const guideTips: GuideTip[] = [
  {
    icon: 'ui-model',
    title: 'Өзүңүз көрсөтүп берсеңиз болот',
    text: 'Бала менен сүйлөшүп жатканда ошол эле сөздөрдү карточкалардан басып көрсөтсөңүз болот: «мен» → «суу» → «ичким келип жатат». Балдар чоңдорду карап үйрөнүшөт — баланы мажбурлоонун кереги жок.',
  },
  {
    icon: 'ui-start',
    title: 'Сүйгөн нерселеринен баштасаңыз болот',
    text: 'Адегенде баланын жакшы көргөн тамагы же оюнчугу сыяктуу бир нече карточка жетиштүү. Калгандарын Китепканадан убактылуу жашырып койсоңуз болот.',
  },
  {
    icon: 'ui-photo',
    title: 'Карточкаларга өз сүрөттөрүңүздү койсоңуз болот',
    text: '«апа», «ата», «мен» карточкаларында үй-бүлөңүздүн чыныгы сүрөттөрү болсо, бала тезирээк түшүнөт. Кантип: Китепкана → «үй-бүлө» → карточканы басыңыз → «Сүрөткө тартуу» → «Сактоо».',
    action: 'openFamily',
  },
  {
    icon: 'ui-voice',
    title: 'Өз үнүңүздү жаздырсаңыз болот',
    text: 'Карточканы ачып, «Жаздыруу» баскычын бассаңыз, Сүйлө сиздин үнүңүз менен сүйлөйт. Тааныш үн балага жагымдуураак болушу мүмкүн.',
  },
  {
    icon: 'ui-praise',
    title: 'Ар бир аракетке дароо жооп берсеңиз жакшы',
    text: 'Бала «суу» деп басса, ага дароо суу берсеңиз — ал сүйлөө иштей турганын түшүнөт. Ар бир аракетин мактасаңыз болот.',
  },
  {
    icon: 'ui-place',
    title: 'Карточкалардын ордун туруктуу калтырсаңыз жакшы',
    text: 'Бала сөздү колунун кыймылы менен эстеп калат. Ордун көп алмаштырбасаңыз, ага жеңилирээк болот.',
  },
  {
    icon: 'ui-heart',
    title: 'Шашпасаңыз болот',
    text: 'Үйрөнүү бир нече жума же ай убакыт алышы мүмкүн. Түзмөк ар дайым баланын жанында болсо жакшы — аны жаза катары тартып албаганыңыз оң.',
  },
]

export const wordTypeLabels: Record<WordType, string> = {
  noun: 'Нерсе',
  verb: 'Аракет',
  person: 'Адам',
  pronoun: 'Мен / сен',
  describe: 'Белги',
  social: 'Сүйлөшүү',
  negation: 'Жок / токто',
  phrase: 'Сүйлөм',
}

export const cardSizeLabels: Record<CardSize, string> = {
  sm: 'Кичине',
  md: 'Орто',
  lg: 'Чоң',
}

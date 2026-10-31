import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { t } from '../i18n'
import { burst } from '../lib/fx'
import { sfx } from '../lib/sfx'
import { buildSentence, type Token } from '../lib/grammar'
import { searchCards } from '../lib/search'
import { AND_CARD, builtinAudioUrl, helperClip, WITH_CARD } from '../lib/library'
import { prepare, preload, speak, stop, subscribe, unlockAudio, type Utterance } from '../lib/speech'
import { useStore } from '../lib/store'
import type { Card, Category } from '../types'
import { CardTile } from './CardTile'
import { Coach } from './Coach'
import { HoldButton } from './HoldButton'
import { IconBackspace, IconClear, IconGear, IconSearch } from './Icons'
import { Mascot } from './Mascot'

const MIN_SLOTS = 3

type Entry = { key: number; cardId: string }

/** What Suylo says for a sentence: words left out by grammar (crossed out in the strip) are not said. */
const utterances = (sentence: Token[]): Utterance[] =>
  sentence
    .filter((tok) => !tok.dropped)
    .map(({ card, punct }) => ({
      text: card.label,
      audio: card.audio,
      audioMid: card.audioMid,
      say: card.say,
      suylo: card.audioSource === 'suylo',
      punct,
      parts: card.parts,
    }))
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Props {
  onOpenSettings: () => void
}

const NARROW = '(max-width: 720px)'
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const update = () => setNarrow(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

export function Talk({ onOpenSettings }: Props) {
  const { library, boards, settings, updateSettings } = useStore()
  // Simple vocabulary: five fixed boards where every word keeps its place. Full: every topic.
  const simple = settings.vocabulary === 'simple'
  const categories: Category[] = useMemo(
    () =>
      simple
        ? boards.map((b) => ({ id: b.id, label: b.label, icon: b.icon, cards: b.slots.filter((c): c is Card => !!c), builtin: true, hidden: false }))
        : library.filter((c) => !c.hidden).map((c) => ({ ...c, cards: c.cards.filter((card) => !card.hidden) })),
    [simple, boards, library],
  )
  const [activeId, setActiveId] = useState(categories[0]?.id)
  const [picking, setPicking] = useState(false)
  // Word search: null = closed; otherwise what was typed. Found cards replace the topic's grid.
  const [query, setQuery] = useState<string | null>(null)
  const found = useMemo(() => (query ? searchCards(categories, query) : []), [categories, query])
  const active = categories.find((c) => c.id === activeId) ?? categories[0]
  const board = simple ? boards.find((b) => b.id === active?.id) : undefined

  // Cards are kept by id so the strip follows parent edits (new picture, word or voice).
  const [entries, setEntries] = useState<Entry[]>([])
  const nextKey = useRef(1)
  const cardById = useMemo(() => new Map(library.flatMap((c) => c.cards).map((card) => [card.id, card])), [library])
  // Whatever the child taps, Suylo builds a correct Kyrgyz sentence from it (see lib/grammar.ts).
  const sentence: Token[] = useMemo(() => {
    const items = entries.flatMap((e) => {
      const card = cardById.get(e.cardId)
      return card ? [{ key: e.key, card }] : []
    })
    // Said exactly as the child tapped it: no word is changed, added or left out (the child's own мүчөлөр still join).
    return buildSentence(items, { and: AND_CARD, with: WITH_CARD, lookup: (id) => cardById.get(id), clip: helperClip }, 'off')
  }, [entries, cardById])
  const tapped = sentence.filter((tok) => !tok.auto)

  // While the child is still tapping, the AI voice gets the sentence ready, so Suylo speaks the moment he is pressed.
  useEffect(() => {
    const timer = setTimeout(() => prepare(utterances(sentence)), 350)
    return () => clearTimeout(timer)
  }, [sentence])

  // First-run walkthrough: tap a card → tap Suylo → meet the parents' gear. Shown once.
  const [coachStep, setCoachStep] = useState(0)
  const [coachReady, setCoachReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setCoachReady(true), 1100)
    return () => clearTimeout(timer)
  }, [])
  const coaching = coachReady && !settings.tutorialDone

  const [noticeKey, setNoticeKey] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [speakingIndex, setSpeakingIndex] = useState(-1)
  const speakingSentence = useRef(false)
  const suyloRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let was = false
    return subscribe((s) => {
      setSpeaking(s.speaking)
      setSpeakingIndex(speakingSentence.current && s.speaking ? s.index : -1)
      // A whole sentence said out loud deserves a little party.
      if (was && !s.speaking && speakingSentence.current && suyloRef.current) {
        const r = suyloRef.current.getBoundingClientRect()
        burst(r.left + r.width / 2, r.top + r.height * 0.4)
        sfx.celebrate()
      }
      was = s.speaking
    })
  }, [])

  // After a few quiet seconds with words waiting, Suylo bounces to say "press me".
  const [beckon, setBeckon] = useState(false)
  useEffect(() => {
    setBeckon(false)
    if (!entries.length || speaking) return
    const timer = setTimeout(() => setBeckon(true), 2600)
    return () => clearTimeout(timer)
  }, [entries, speaking])

  useEffect(() => {
    if (active) preload(active.cards.map((c) => c.audio))
  }, [active])

  const stripRef = useRef<HTMLDivElement>(null)
  const flight = useRef<{ key: number; from: DOMRect; src: string; label: string } | null>(null)
  const lastLefts = useRef(new Map<string, number>())
  const lastLabels = useRef(new Map<string, string>())

  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const items = [...strip.querySelectorAll<HTMLElement>('[data-key]')]

    // FLIP: when Kyrgyz word order moves a word, slide it from where it was.
    if (!reducedMotion()) {
      for (const el of items) {
        const key = el.dataset.key!
        const before = lastLefts.current.get(key)
        const dx = before === undefined ? 0 : before - el.offsetLeft
        if (dx) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 480, easing: SPRING })
      }
    }
    lastLefts.current = new Map(items.map((el) => [el.dataset.key!, el.offsetLeft]))

    // Grammar changed a word (мен → менин): flip that card over so the change is visible.
    const labels = new Map(sentence.map((i) => [i.key, i.card.label]))
    if (!reducedMotion()) {
      for (const [key, label] of labels) {
        const before = lastLabels.current.get(key) ?? (flight.current && String(flight.current.key) === key ? flight.current.label : undefined)
        if (before === undefined || before === label) continue
        const card = strip.querySelector<HTMLElement>(`[data-key="${key}"] .card`)
        window.setTimeout(() => sfx.flip(), 400)
        card?.animate(
          [
            { transform: 'perspective(500px) rotateY(0deg)' },
            { transform: 'perspective(500px) rotateY(90deg)', offset: 0.35 },
            { transform: 'perspective(500px) rotateY(-12deg)', offset: 0.75 },
            { transform: 'perspective(500px) rotateY(0deg)' },
          ],
          { duration: 620, delay: 380, easing: 'ease-out', fill: 'backwards' },
        )
        card?.animate(
          [{ boxShadow: '0 0 0 0 rgba(98, 168, 227, 0.7)' }, { boxShadow: '0 0 0 10px rgba(98, 168, 227, 0)' }],
          { duration: 700, delay: 700 },
        )
      }
    }
    lastLabels.current = labels

    // The tapped picture flies from the grid into its place in the sentence strip.
    const f = flight.current
    flight.current = null
    if (!f) return
    const target = strip.querySelector<HTMLElement>(`[data-key="${f.key}"]`)
    const targetImg = target?.querySelector('img')
    if (!target || !targetImg) return
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if (reducedMotion()) return
    const to = targetImg.getBoundingClientRect()
    const clone = document.createElement('img')
    clone.src = f.src
    clone.className = 'flying-card'
    Object.assign(clone.style, {
      left: `${f.from.left}px`,
      top: `${f.from.top}px`,
      width: `${f.from.width}px`,
      height: `${f.from.height}px`,
    })
    document.body.appendChild(clone)
    target.style.opacity = '0'
    const dx = to.left + to.width / 2 - (f.from.left + f.from.width / 2)
    const dy = to.top + to.height / 2 - (f.from.top + f.from.height / 2)
    const scale = to.width / f.from.width
    let landed = false
    const land = () => {
      if (landed) return
      landed = true
      clone.remove()
      target.style.opacity = ''
      if (target.isConnected) target.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: SPRING })
    }
    const fly = clone.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(${(1 + scale) / 2 + 0.08}) rotate(-8deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)` },
      ],
      { duration: 460, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
    )
    // The card must show up even if the flight is interrupted (tab switch, phone busy).
    fly.onfinish = land
    fly.oncancel = land
    window.setTimeout(land, 900)
  }, [sentence])

  // Sliding black pill behind the active category tab.
  const tabsRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const place = () => {
      const tab = tabsRef.current?.querySelector<HTMLElement>('.tab.is-active')
      const pill = pillRef.current
      if (!tab || !pill || !tab.offsetWidth) return // hidden while searching
      pill.style.width = `${tab.offsetWidth}px`
      pill.style.transform = `translateX(${tab.offsetLeft}px)`
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [active?.id, categories.length, query === null])

  const pressCard = (card: Card, el: HTMLElement) => {
    unlockAudio()
    sfx.pop()
    window.setTimeout(() => sfx.whoosh(), 30)
    window.setTimeout(() => sfx.boing(), 120)
    const key = nextKey.current++
    const img = el.querySelector('img')
    if (img) flight.current = { key, from: img.getBoundingClientRect(), src: card.image, label: card.label }
    setEntries((prev) => [...prev, { key, cardId: card.id }])
    setNoticeKey((n) => n + 1)
    if (coaching && coachStep === 0) setCoachStep(1)
    if (settings.speakOnTap) {
      speakingSentence.current = false
      void speak([{ text: card.label, audio: card.audio }], card.mood ?? null)
    }
  }

  // Suylo is the speak button: press him and he says the whole sentence.
  const speakSentence = () => {
    unlockAudio()
    if (coaching && coachStep === 1 && sentence.length) setCoachStep(2)
    if (!sentence.length) {
      speakingSentence.current = false
      void speak([{ text: t.greeting, audio: builtinAudioUrl('_greeting') }], 'happy')
      return
    }
    speakingSentence.current = true
    const mood = [...sentence].reverse().find((i) => !i.dropped && i.card.mood)?.card.mood ?? null
    void speak(utterances(sentence), mood)
  }

  /** Shrinks words out of the strip, then removes them (`drop` says which entries go). */
  const removeItems = (keys: string[], drop: (prev: Entry[]) => Entry[]) => {
    const els = keys
      .map((k) => stripRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`))
      .filter((el): el is HTMLElement => !!el)
    if (els.length) sfx.remove()
    if (reducedMotion() || !els.length) {
      setEntries(drop)
      return
    }
    const anims = els.map((el, i) =>
      el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.3) translateY(10px)', opacity: 0 }], {
        duration: 200,
        delay: (els.length - 1 - i) * 35,
        easing: 'cubic-bezier(0.5, 0, 0.75, 0)',
        fill: 'forwards',
      }),
    )
    // Always remove them, even if an animation was interrupted; then drop the "hidden" end state so no
    // card that stays is left invisible.
    void Promise.allSettled(anims.map((a) => a.finished)).then(() => {
      flushSync(() => setEntries(drop))
      anims.forEach((a) => a.cancel())
    })
  }

  const backspace = () => {
    // Remove the word the child sees last, which may not be the one tapped last after reordering.
    const last = tapped[tapped.length - 1]
    if (!last) return
    const gone = (last.keys ?? [last.key]).map(Number)
    removeItems([last.key], (prev) => prev.filter((e) => !gone.includes(e.key)))
  }

  // Clear means everything: every word, also ones grammar hid or joined, and Suylo stops talking.
  const clear = () => {
    stop()
    removeItems(
      sentence.map((tok) => tok.key),
      () => [],
    )
  }

  const slots = Math.max(1, MIN_SLOTS - sentence.length)
  // No limit on words: a long sentence wraps onto more lines and its cards get smaller (sooner on a
  // phone, where the strip is narrow).
  const phone = useNarrow()
  const [dense, denser] = phone ? [3, 6] : [6, 12]
  const density = sentence.length > denser ? ' is-denser' : sentence.length > dense ? ' is-dense' : ''

  return (
    <div className={`talk size--${settings.cardSize}${settings.colorCoding ? ' color-coded' : ''}`}>
      <header className="talk-top">
        <div className="talk-suylo" ref={suyloRef}>
          <Mascot size={92} onClick={speakSentence} noticeKey={noticeKey} beckon={beckon} label={t.speak} />
        </div>
        <div className={`strip${density}`} ref={stripRef}>
          <div className="strip-scroll">
            {sentence.map((tok, i) => (
              <div key={tok.key} data-key={tok.key} className={`strip-item${tok.auto ? ' is-auto' : ''}${tok.dropped ? ' is-dropped' : ''}`}>
                <CardTile card={tok.card} size="strip" active={i === speakingIndex} />
              </div>
            ))}
            {Array.from({ length: slots }, (_, i) => (
              <span key={`slot-${i}`} className="strip-slot" style={{ ['--i' as string]: i }} />
            ))}
            {sentence.length === 0 && <span className="strip-hint">{t.tapCards}</span>}
          </div>
          {sentence.length > 0 && (
            <div className="strip-tools">
              <button type="button" className="tool-btn" onClick={backspace} aria-label={t.backspace}>
                <IconBackspace />
              </button>
              <button type="button" className="tool-btn" onClick={clear} aria-label={t.clear}>
                <IconClear />
              </button>
            </div>
          )}
        </div>
        <HoldButton onHold={onOpenSettings} label={t.holdForSettings}>
          <IconGear />
        </HoldButton>
      </header>

      <nav className={`tabs${query !== null ? ' is-searching' : ''}${simple ? ' tabs--board' : ''}`} aria-label={t.categories}>
        {query !== null ? (
          <div className="search">
            <IconSearch />
            <input
              className="search-input"
              type="search"
              value={query}
              placeholder={t.searchPlaceholder}
              aria-label={t.search}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery(null)}
            />
            <button type="button" className="search-close" onClick={() => setQuery(null)} aria-label={t.closeSearch}>
              <IconClear />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="tabs-all"
            onClick={() => {
              sfx.tick()
              setQuery('')
            }}
            aria-label={t.search}
          >
            <IconSearch />
          </button>
        )}
        {query === null && categories.length > 12 && (
          <button type="button" className="tabs-all" onClick={() => setPicking(true)} aria-label={t.allCategories}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              {[4, 10, 16].flatMap((x) => [4, 10, 16].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="4.5" height="4.5" rx="1.4" fill="currentColor" />))}
            </svg>
          </button>
        )}
        <div className="tabs-track" ref={tabsRef} hidden={query !== null}>
          <span className="tab-pill" ref={pillRef} aria-hidden="true" />
          {categories.map((cat, i) => (
            <button
              key={cat.id}
              type="button"
              className={`tab${cat.id === active?.id ? ' is-active' : ''}`}
              style={{ ['--i' as string]: i }}
              onClick={() => {
                if (cat.id !== active?.id) sfx.tick()
                setActiveId(cat.id)
              }}
            >
              <img src={cat.icon} alt="" draggable={false} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className={`grid-wrap${query !== null ? ' is-searching' : ''}${board && !query ? ' is-board' : ''}`}>
        {query ? (
          found.length ? (
            <div className="grid" key="search">
              {found.map((card, i) => (
                <CardTile key={card.id} card={card} onPress={pressCard} index={i} />
              ))}
            </div>
          ) : (
            <p className="search-none">{t.searchNone}</p>
          )
        ) : board ? (
          // Every word in its own fixed slot; an empty slot stays a gap, so nothing ever moves.
          <div className={`grid grid--board${board.slots.length > 12 ? ' grid--main' : ''}`} key={board.id}>
            {board.slots.map((card, i) =>
              card ? <CardTile key={card.id} card={card} onPress={pressCard} /> : <span key={`empty-${i}`} className="slot-empty" aria-hidden="true" />,
            )}
          </div>
        ) : (
          <div className="grid" key={active?.id}>
            {active?.cards.map((card, i) => (
              <CardTile key={card.id} card={card} onPress={pressCard} index={i} />
            ))}
          </div>
        )}
      </main>

      {picking && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t.allCategories} onClick={() => setPicking(false)}>
          <div className="sheet picker" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet-title">{t.allCategories}</h2>
            <div className="picker-grid">
              {categories.map((cat, i) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`picker-tile${cat.id === active?.id ? ' is-active' : ''}`}
                  style={{ ['--i' as string]: i }}
                  onClick={() => {
                    sfx.tick()
                    setActiveId(cat.id)
                    setPicking(false)
                  }}
                >
                  <img src={cat.icon} alt="" />
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {coaching && <Coach step={coachStep} onFinish={() => void updateSettings({ tutorialDone: true })} />}
    </div>
  )
}

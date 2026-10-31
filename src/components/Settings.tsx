import { useEffect, useState } from 'react'
import { cardSizeLabels, guideTips, t } from '../i18n'
import { builtinAudioUrl, newId } from '../lib/library'
import { searchCards } from '../lib/search'
import { speak, unlockAudio } from '../lib/speech'
import { subscribeVoices } from '../lib/offline'
import { packInfo } from '../lib/pack'
import { resizeImage } from '../lib/media'
import { useStore } from '../lib/store'
import type { Board, Card, CardSize, Category } from '../types'
import { CardEditor } from './CardEditor'
import { CardTile } from './CardTile'
import { IconBack, IconChevron, IconImage, IconPlay, IconPlus } from './Icons'
import { PinGate } from './PinGate'

interface Props {
  onClose: () => void
}

export function Settings({ onClose }: Props) {
  const [tab, setTab] = useState<'library' | 'general'>('library')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const { library } = useStore()
  const category = library.find((c) => c.id === categoryId)

  return (
    <div className="settings">
      <header className="settings-top">
        <button
          type="button"
          className="btn btn--ghost back-btn"
          onClick={() => (category ? setCategoryId(null) : onClose())}
        >
          <IconBack />
          {t.back}
        </button>
        <h1>{category ? category.label || t.newCategory : t.forParents}</h1>
        {!category && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}>
              {t.tabLibrary}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'general'} onClick={() => setTab('general')}>
              {t.tabSettings}
            </button>
          </div>
        )}
      </header>

      <div className="settings-body">
        {/* Keyed wrapper so every switch slides the new page in. */}
        <div className="page" key={category ? `cat-${category.id}` : tab}>
          {category ? (
            <CategoryEditor key={category.id} category={category} onDeleted={() => setCategoryId(null)} />
          ) : tab === 'library' ? (
            <LibraryTab onOpen={setCategoryId} />
          ) : (
            <GeneralSettings
              onOpenCategory={(id) => {
                setTab('library')
                setCategoryId(id)
              }}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Optional big dictionary: shows its size first, downloads with a progress bar, can be removed. */
function PackPanel() {
  const { settings, pack, installPack, removePack } = useStore()
  const [info, setInfo] = useState<{ words: number; bytes: number } | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!settings.packInstalled) void packInfo().then((p) => p && setInfo(p))
  }, [settings.packInstalled])

  const install = async () => {
    setError('')
    setProgress(0)
    try {
      await installPack((done, total) => setProgress(Math.round((done / total) * 100)))
    } catch {
      setError(t.packFailed)
    }
    setProgress(null)
  }

  return (
    <section className="pack-panel">
      <img src={`${import.meta.env.BASE_URL}cards/ui-start.png`} alt="" className="pack-icon" />
      <div className="pack-body">
        <h3>{t.packTitle}</h3>
        {settings.packInstalled ? (
          <p className="status status--ok">✓ {t.packInstalled(pack?.words ?? 0)}</p>
        ) : (
          <p>{info ? t.packDesc(info.words, Math.round(info.bytes / 1e6)) : navigator.onLine ? '…' : t.packNeedsInternet}</p>
        )}
        <p className="muted small">{t.packNote}</p>
        {progress !== null && (
          <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
            <em>{t.packInstalling(progress)}</em>
          </div>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
      <div className="pack-actions">
        {settings.packInstalled ? (
          <button
            type="button"
            className="btn btn--danger-ghost"
            onClick={async () => {
              if (confirm(t.packConfirmRemove)) await removePack()
            }}
          >
            {t.packRemove}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={install} disabled={progress !== null || !info}>
            {t.packInstall}
          </button>
        )}
      </div>
    </section>
  )
}

/** Simple (56 words on five fixed pages) or full (every topic): the simple pages are edited slot by slot. */
function LibraryTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { settings, updateSettings } = useStore()
  const simple = settings.vocabulary === 'simple'
  return (
    <>
      <section className="panel vocab-panel">
        <span className="field-label">{t.vocabTitle}</span>
        <div className="segmented segmented--wide" role="tablist">
          <button type="button" role="tab" aria-selected={simple} onClick={() => updateSettings({ vocabulary: 'simple' })}>
            {t.vocabSimple}
          </button>
          <button type="button" role="tab" aria-selected={!simple} onClick={() => updateSettings({ vocabulary: 'full' })}>
            {t.vocabFull}
          </button>
        </div>
        <p className="muted small">{simple ? t.vocabSimpleHint : t.vocabFullHint}</p>
      </section>
      {simple ? <BoardEditor /> : <CategoryList onOpen={onOpen} />}
    </>
  )
}

// A board's words belong to this topic of the full library (a new word made here goes there too, so it also
// shows in «Толук» and gets that topic's grammar: a new food is eaten).
const BOARD_TOPIC: Record<string, string> = { main: 'core', food: 'food', feelings: 'feelings', play: 'play', people: 'people' }

/** The five pages as the child sees them: tap a word to change it or put another in its place; tap a gap to fill it. */
function BoardEditor() {
  const { boards, setSlot, resetBoard } = useStore()
  const [boardId, setBoardId] = useState(boards[0]?.id ?? 'main')
  const [slot, setSlotIndex] = useState<number | null>(null)
  const [mode, setMode] = useState<'menu' | 'pick' | 'edit' | 'new' | null>(null)
  const board = boards.find((b) => b.id === boardId) ?? boards[0]
  const card = slot !== null ? board?.slots[slot] : null
  const close = () => {
    setMode(null)
    setSlotIndex(null)
  }
  const open = (i: number) => {
    setSlotIndex(i)
    setMode(board.slots[i] ? 'menu' : 'pick')
  }
  if (!board) return null

  return (
    <>
      <section className="board-editor">
        <h3 className="settings-h3">{t.boardsTitle}</h3>
        <p className="muted">{t.boardsHint}</p>
        <div className="board-tabs" role="tablist">
          {boards.map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={b.id === board.id} onClick={() => setBoardId(b.id)}>
              <img src={b.icon} alt="" />
              <span>{b.label}</span>
            </button>
          ))}
        </div>
        <div className="grid grid--board-edit">
          {board.slots.map((c, i) =>
            c ? (
              <CardTile key={`${i}-${c.id}`} card={c} onPress={() => open(i)} />
            ) : (
              <button key={`empty-${i}`} type="button" className="slot-add" onClick={() => open(i)} aria-label={t.emptySlot}>
                <IconPlus />
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            if (confirm(t.confirmBoardReset)) await resetBoard(board.id)
          }}
        >
          {t.boardReset}
        </button>
      </section>
      <PackPanel />

      {mode === 'menu' && card && (
        <div className="overlay" role="dialog" aria-modal="true" onClick={close}>
          <div className="sheet slot-menu" onClick={(e) => e.stopPropagation()}>
            <CardTile card={card} />
            <button type="button" className="btn btn--soft" onClick={() => setMode('edit')}>
              {t.slotEdit}
            </button>
            <button type="button" className="btn btn--soft" onClick={() => setMode('pick')}>
              {t.slotReplace}
            </button>
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={async () => {
                await setSlot(board.id, slot!, null)
                close()
              }}
            >
              {t.slotClear}
            </button>
          </div>
        </div>
      )}
      {mode === 'pick' && slot !== null && (
        <SlotPicker
          board={board}
          onPick={async (id) => {
            await setSlot(board.id, slot, id)
            close()
          }}
          onNew={() => setMode('new')}
          onClose={close}
        />
      )}
      {mode === 'edit' && card && <CardEditor card={card} categoryId={card.categoryId} onClose={close} />}
      {mode === 'new' && slot !== null && (
        <CardEditor
          categoryId={BOARD_TOPIC[board.id] ?? 'core'}
          onSaved={(id) => void setSlot(board.id, slot, id)}
          onClose={close}
        />
      )}
    </>
  )
}

/** Any word of the library (the big dictionary too, once downloaded); the page's own topic is shown first. */
function SlotPicker({ board, onPick, onNew, onClose }: { board: Board; onPick: (id: string) => void; onNew: () => void; onClose: () => void }) {
  const { library } = useStore()
  const [query, setQuery] = useState('')
  const onBoard = new Set(board.slots.map((c) => c?.id))
  const topic = library.find((c) => c.id === BOARD_TOPIC[board.id])
  const found = (query.trim() ? searchCards(library, query) : (topic?.cards ?? [])).filter((c) => !c.hidden && !onBoard.has(c.id))
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet slot-picker" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{t.slotPickTitle}</h2>
        <input className="input" type="search" value={query} placeholder={t.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <p className="muted small">{t.slotPickHint}</p>
        <div className="grid grid--editor">
          <button type="button" className="card card--grid card--add" onClick={onNew}>
            <span className="add-icon">
              <IconPlus />
            </span>
            <span className="card-label">{t.slotNewWord}</span>
          </button>
          {found.slice(0, 60).map((c) => (
            <CardTile key={c.id} card={c} onPress={() => onPick(c.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function CategoryList({ onOpen }: { onOpen: (id: string) => void }) {
  const { library, saveCategory } = useStore()

  const addCategory = async () => {
    const id = newId('cat')
    await saveCategory({ id, custom: true, label: '' })
    onOpen(id)
  }

  return (
    <>
    <PackPanel />
    <div className="cat-list">
      {library.map((cat) => (
        <button key={cat.id} type="button" className={`cat-row${cat.hidden ? ' is-dimmed' : ''}`} onClick={() => onOpen(cat.id)}>
          <img src={cat.icon} alt="" />
          <span className="cat-row-text">
            <strong>{cat.label || t.newCategory}</strong>
            <small>
              {t.cardsCount(cat.cards.length)}
              {cat.hidden && ` · ${t.hiddenBadge}`}
            </small>
          </span>
          <IconChevron />
        </button>
      ))}
      <button type="button" className="cat-row cat-row--add" onClick={addCategory}>
        <span className="add-icon">
          <IconPlus />
        </span>
        <strong>{t.newCategory}</strong>
      </button>
    </div>
    </>
  )
}

function CategoryEditor({ category, onDeleted }: { category: Category; onDeleted: () => void }) {
  const { categoryRecord, saveCategory, removeCategory } = useStore()
  const [editing, setEditing] = useState<Card | 'new' | null>(null)
  const record = categoryRecord(category.id)
  const [name, setName] = useState(category.label)

  const update = (patch: { label?: string; hidden?: boolean; image?: Blob }) =>
    saveCategory({ ...record, id: category.id, custom: !category.builtin, ...patch })

  return (
    <div className="cat-editor">
      <div className="cat-editor-head">
        <label className="field grow">
          <span className="field-label">{t.categoryName}</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== category.label && update({ label: name.trim() })}
            autoFocus={!category.builtin && !category.label}
          />
        </label>
        <label className="btn btn--soft file-btn">
          <IconImage />
          {t.picture}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await update({ image: await resizeImage(file, 256) })
            }}
          />
        </label>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={category.hidden} onChange={(e) => update({ hidden: e.target.checked })} />
        <span className="toggle-ui" />
        <span>{t.hideCategory}</span>
      </label>

      <div className="grid grid--editor">
        {category.cards.map((card) => (
          <CardTile key={card.id} card={card} onPress={setEditing} dimmed={card.hidden} badge={card.hidden ? t.hiddenBadge : undefined} />
        ))}
        <button type="button" className="card card--grid card--add" onClick={() => setEditing('new')}>
          <span className="add-icon">
            <IconPlus />
          </span>
          <span className="card-label">{t.newCard}</span>
        </button>
      </div>

      {!category.builtin && (
        <button
          type="button"
          className="btn btn--danger-ghost"
          onClick={async () => {
            if (!confirm(t.confirmDeleteCategory)) return
            await removeCategory(category.id)
            onDeleted()
          }}
        >
          {t.deleteCategory}
        </button>
      )}

      {editing && (
        <CardEditor
          card={editing === 'new' ? undefined : editing}
          categoryId={category.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** Offline is ready when the app is saved and so are all of Suylo's voice clips. */
function useOfflineReady() {
  const [app, setApp] = useState(false)
  const [voices, setVoices] = useState({ done: 0, total: 1 })
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((reg) => setApp(!!reg?.active))
    return subscribeVoices((done, total) => setVoices({ done, total }))
  }, [])
  return app && voices.done >= voices.total
}

const BASE = import.meta.env.BASE_URL

/** How to use Suylo with a child — gentle "you can…" tips, based on how the big AAC apps coach parents. */
function ParentGuide({ onOpenFamily }: { onOpenFamily: () => void }) {
  return (
    <section className="guide">
      <h3>{t.guideTitle}</h3>
      <p className="muted">{t.guideIntro}</p>
      <ol className="guide-list">
        {guideTips.map((tip, i) => (
          <li key={tip.icon} className="guide-tip" style={{ ['--i' as string]: i }}>
            <img src={`${BASE}cards/${tip.icon}.png`} alt="" />
            <div>
              <strong>{tip.title}</strong>
              <p>{tip.text}</p>
              {tip.action === 'openFamily' && (
                <button type="button" className="btn btn--soft btn--small" onClick={onOpenFamily}>
                  {t.guideOpenFamily} →
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Ready-made voices: a starting point; the sliders fine-tune.
const VOICE_PRESETS = [
  { id: 'normal', speed: 1, pitch: 1 },
  { id: 'slow', speed: 0.75, pitch: 1 },
  { id: 'fast', speed: 1.35, pitch: 1 },
  { id: 'chick', speed: 1.1, pitch: 1.45 },
  { id: 'giant', speed: 0.85, pitch: 0.7 },
] as const

/** How Suylo speaks: speed (slow ↔ fast) and pitch (deep ↔ high), heard right away. */
function VoicePanel() {
  const { settings, updateSettings } = useStore()
  const tryIt = () => {
    unlockAudio()
    void speak([{ text: t.greeting, audio: builtinAudioUrl('_greeting'), suylo: true }], 'happy')
  }
  const slider = (key: 'voiceSpeed' | 'voicePitch', label: string, low: string, high: string, min: number, max: number) => (
    <label className="voice-slider">
      <span className="field-label">{label}</span>
      <span className="voice-range">
        <small>{low}</small>
        <input
          type="range"
          min={min}
          max={max}
          step={0.05}
          value={settings[key]}
          onChange={(e) => void updateSettings({ [key]: Number(e.target.value) })}
          onPointerUp={tryIt}
          onKeyUp={tryIt}
        />
        <small>{high}</small>
      </span>
    </label>
  )
  return (
    <section className="panel voice-panel">
      <p className="muted">{t.voiceHint}</p>
      <div className="voice-presets">
        {VOICE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`voice-preset${settings.voiceSpeed === preset.speed && settings.voicePitch === preset.pitch ? ' is-active' : ''}`}
            onClick={async () => {
              await updateSettings({ voiceSpeed: preset.speed, voicePitch: preset.pitch })
              tryIt()
            }}
          >
            {t.voicePresets[preset.id]}
          </button>
        ))}
      </div>
      {slider('voiceSpeed', t.voiceSpeed, t.voiceSlow, t.voiceFast, 0.6, 1.6)}
      {slider('voicePitch', t.voicePitch, t.voiceLow, t.voiceHigh, 0.65, 1.6)}
      <button type="button" className="btn btn--soft" onClick={tryIt}>
        <IconPlay />
        {t.voiceTry}
      </button>
    </section>
  )
}

function GeneralSettings({ onOpenCategory, onClose }: { onOpenCategory: (id: string) => void; onClose: () => void }) {
  const { settings, updateSettings, resetAll } = useStore()
  const [changingPin, setChangingPin] = useState(false)
  const offline = useOfflineReady()

  const toggle = (key: 'colorCoding' | 'speakOnTap' | 'intro' | 'soundEffects', label: string, hint?: string) => (
    <label className="toggle">
      <input type="checkbox" checked={settings[key]} onChange={(e) => updateSettings({ [key]: e.target.checked })} />
      <span className="toggle-ui" />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )

  return (
    <div className="general">
      <h2 className="settings-h2">{t.settingsHeading}</h2>
      <ParentGuide onOpenFamily={() => onOpenCategory('people')} />
      <button
        type="button"
        className="btn btn--soft"
        onClick={async () => {
          await updateSettings({ tutorialDone: false })
          onClose()
        }}
      >
        {t.replayTutorial}
      </button>

      <h3 className="settings-h3">{t.optionsHeading}</h3>
      <section className="panel">
        {settings.vocabulary === 'full' && <div className="field">
          <span className="field-label">{t.cardSize}</span>
          <div className="segmented segmented--wide">
            {(Object.keys(cardSizeLabels) as CardSize[]).map((size) => (
              <button key={size} type="button" aria-selected={settings.cardSize === size} onClick={() => updateSettings({ cardSize: size })}>
                {cardSizeLabels[size]}
              </button>
            ))}
          </div>
        </div>}
        {toggle('speakOnTap', t.speakOnTap, t.speakOnTapHint)}
        {toggle('colorCoding', t.colorCoding, t.colorCodingHint)}
        {toggle('soundEffects', t.soundEffects, t.soundEffectsHint)}
        {toggle('intro', t.intro)}
      </section>

      <h3 className="settings-h3">{t.voiceHeading}</h3>
      <VoicePanel />

      <section className="panel">
        <button type="button" className="btn btn--soft" onClick={() => setChangingPin(true)}>
          {t.changePin}
        </button>
        <p className={`status ${offline ? 'status--ok' : ''}`}>{offline ? `✓ ${t.offlineReady}` : t.offlinePending}</p>
        <p className="muted">{t.installHint}</p>
        <p className="muted">{t.privacy}</p>
      </section>

      <section className="panel">
        <button
          type="button"
          className="btn btn--danger-ghost"
          onClick={async () => {
            if (confirm(t.confirmReset)) await resetAll()
          }}
        >
          {t.resetAll}
        </button>
        <p className="muted small">{t.credits}</p>
      </section>

      {changingPin && <PinGate changeOnly onUnlock={() => setChangingPin(false)} onCancel={() => setChangingPin(false)} />}
    </div>
  )
}

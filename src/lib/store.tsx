import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import { BOARDS, buildBoards, buildLibrary } from './library'
import { installPack as downloadPack, loadPack, PACK_VERSION, removePack as deletePack, type Pack } from './pack'
import { aiClip, subscribeAi } from './speech'
import { setVoice } from './voice'
import { defaultSettings, type Board, type BoardSlots, type CardRecord, type Category, type CategoryRecord, type Settings } from '../types'

interface Store {
  ready: boolean
  library: Category[]
  /** The simple vocabulary's five fixed boards (used when settings.vocabulary is 'simple'). */
  boards: Board[]
  /** Puts a word (or nothing) into one slot of a board; the other slots stay as they are. */
  setSlot: (boardId: string, index: number, cardId: string | null) => Promise<void>
  /** Back to the board as Suylo ships it. */
  resetBoard: (boardId: string) => Promise<void>
  settings: Settings
  cardRecord: (id: string) => CardRecord | undefined
  categoryRecord: (id: string) => CategoryRecord | undefined
  saveCard: (record: Omit<CardRecord, 'createdAt' | 'updatedAt'>) => Promise<void>
  removeCard: (id: string) => Promise<void>
  saveCategory: (record: Omit<CategoryRecord, 'createdAt' | 'updatedAt'>) => Promise<void>
  removeCategory: (id: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  resetAll: () => Promise<void>
  pack: Pack | null
  installPack: (onProgress: (done: number, total: number) => void) => Promise<void>
  removePack: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)
const voicing = new Set<string>()

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [cards, setCards] = useState<CardRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [pack, setPack] = useState<Pack | null>(null)
  const [boardSlots, setBoardSlots] = useState<BoardSlots>({})
  // Mirrors of the latest state, so writes to IndexedDB never depend on when React runs an updater.
  const latest = useRef({ cards, categories, settings, boardSlots })
  latest.current = { cards, categories, settings, boardSlots }

  useEffect(() => {
    db.loadAll()
      .then((data) => {
        setCards(data.cards)
        setCategories(data.categories)
        setSettings(data.settings)
        setBoardSlots(data.boards)
      })
      .catch((err) => console.error('Could not open local storage', err))
      .finally(() => setReady(true))
  }, [])

  // The big dictionary, if the parents installed it (read from the offline cache).
  useEffect(() => {
    if (!ready || !settings.packInstalled) return
    void loadPack().then((installed) => {
      setPack(installed)
      // Installed before an update: quietly fetch only what is new (the rest is already cached).
      if (installed && installed.version < PACK_VERSION && navigator.onLine)
        void downloadPack(() => {})
          .then(setPack)
          .catch(() => {})
    })
  }, [ready, settings.packInstalled])

  const library = useMemo(() => buildLibrary(cards, categories, pack), [cards, categories, pack])
  const boards = useMemo(() => buildBoards(library, boardSlots), [library, boardSlots])

  const setSlot = useCallback(async (boardId: string, index: number, cardId: string | null) => {
    const shipped = BOARDS.find((b) => b.id === boardId)
    if (!shipped || index < 0 || index >= shipped.slots.length) return
    const prev = latest.current.boardSlots
    const slots = [...(prev[boardId] ?? shipped.slots)]
    slots[index] = cardId
    const next = { ...prev, [boardId]: slots }
    latest.current.boardSlots = next
    setBoardSlots(next)
    await db.saveBoards(next)
  }, [])

  const resetBoard = useCallback(async (boardId: string) => {
    const next = { ...latest.current.boardSlots }
    delete next[boardId]
    latest.current.boardSlots = next
    setBoardSlots(next)
    await db.saveBoards(next)
  }, [])

  // How Suylo sounds (speed and pitch from Settings) applies to everything it says.
  useEffect(() => setVoice({ speed: settings.voiceSpeed, pitch: settings.voicePitch }), [settings.voiceSpeed, settings.voicePitch])

  const saveCard = useCallback(async (partial: Omit<CardRecord, 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const prev = latest.current.cards
    const existing = prev.find((c) => c.id === partial.id)
    const record: CardRecord = { ...partial, createdAt: existing?.createdAt ?? now, updatedAt: now }
    const next = existing ? prev.map((c) => (c.id === record.id ? record : c)) : [...prev, record]
    latest.current.cards = next
    setCards(next)
    await db.putCard(record)
  }, [])

  // A parent's word with no voice yet: while Suylo's AI voice is reachable, it is made once and kept on the
  // device, so the word never falls back to the robot voice — offline too.
  useEffect(() => {
    if (!ready) return
    return subscribeAi((online) => {
      if (!online) return
      for (const card of library.flatMap((c) => c.cards)) {
        const rec = latest.current.cards.find((r) => r.id === card.id)
        if (card.audioSource !== 'none' || !rec || !card.label.trim() || voicing.has(card.id)) continue
        voicing.add(card.id)
        void aiClip(card.label)
          .then((blob) => {
            const now = latest.current.cards.find((r) => r.id === card.id)
            if (blob && now && (now.label ?? card.label) === card.label) return saveCard({ ...now, suyloAudio: blob, suyloAudioLabel: card.label })
          })
          .finally(() => voicing.delete(card.id))
      }
    })
  }, [ready, library, saveCard])

  const cardRecord = useCallback((id: string) => cards.find((c) => c.id === id), [cards])
  const categoryRecord = useCallback((id: string) => categories.find((c) => c.id === id), [categories])

  const removeCard = useCallback(async (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id))
    await db.deleteCard(id)
  }, [])

  const saveCategory = useCallback(async (partial: Omit<CategoryRecord, 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const prev = latest.current.categories
    const existing = prev.find((c) => c.id === partial.id)
    const record: CategoryRecord = { ...partial, createdAt: existing?.createdAt ?? now, updatedAt: now }
    const next = existing ? prev.map((c) => (c.id === record.id ? record : c)) : [...prev, record]
    latest.current.categories = next
    setCategories(next)
    await db.putCategory(record)
  }, [])

  const removeCategory = useCallback(async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setCards((prev) => prev.filter((c) => !(c.custom && c.categoryId === id)))
    await db.deleteCategory(id)
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...latest.current.settings, ...patch }
    latest.current.settings = next
    setSettings(next)
    await db.saveSettings(next)
  }, [])

  const resetAll = useCallback(async () => {
    await db.resetEverything()
    setCards([])
    setCategories([])
    setSettings(defaultSettings)
    setBoardSlots({})
  }, [])

  const installPack = useCallback(
    async (onProgress: (done: number, total: number) => void) => {
      setPack(await downloadPack(onProgress))
      await updateSettings({ packInstalled: true })
    },
    [updateSettings],
  )

  const removePack = useCallback(async () => {
    await deletePack()
    setPack(null)
    await updateSettings({ packInstalled: false })
  }, [updateSettings])

  const value: Store = {
    ready,
    library,
    boards,
    setSlot,
    resetBoard,
    settings,
    cardRecord,
    categoryRecord,
    saveCard,
    removeCard,
    saveCategory,
    removeCategory,
    updateSettings,
    resetAll,
    pack,
    installPack,
    removePack,
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore outside StoreProvider')
  return store
}

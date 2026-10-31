import { openDB, type DBSchema } from 'idb'
import { defaultSettings, type BoardSlots, type CardRecord, type CategoryRecord, type Settings } from '../types'

// Everything a family adds stays on the device: no account, no server.
interface SuyloDB extends DBSchema {
  cards: { key: string; value: CardRecord }
  categories: { key: string; value: CategoryRecord }
  kv: { key: string; value: unknown }
}

const dbPromise = openDB<SuyloDB>('suylo', 1, {
  upgrade(db) {
    db.createObjectStore('cards', { keyPath: 'id' })
    db.createObjectStore('categories', { keyPath: 'id' })
    db.createObjectStore('kv')
  },
})

export async function loadAll() {
  const db = await dbPromise
  const [cards, categories, settings, boards] = await Promise.all([
    db.getAll('cards'),
    db.getAll('categories'),
    db.get('kv', 'settings') as Promise<Partial<Settings> | undefined>,
    db.get('kv', 'boards') as Promise<BoardSlots | undefined>,
  ])
  // From before the simple boards: a family that downloaded the big dictionary keeps all its words.
  const vocabulary = settings?.vocabulary ?? (settings?.packInstalled ? 'full' : 'simple')
  return { cards, categories, settings: { ...defaultSettings, ...settings, vocabulary }, boards: boards ?? {} }
}

export async function saveBoards(boards: BoardSlots) {
  await (await dbPromise).put('kv', boards, 'boards')
}

export async function putCard(record: CardRecord) {
  await (await dbPromise).put('cards', record)
}

export async function deleteCard(id: string) {
  await (await dbPromise).delete('cards', id)
}

export async function putCategory(record: CategoryRecord) {
  await (await dbPromise).put('categories', record)
}

export async function deleteCategory(id: string) {
  const db = await dbPromise
  const tx = db.transaction(['categories', 'cards'], 'readwrite')
  await tx.objectStore('categories').delete(id)
  const cards = tx.objectStore('cards')
  for (const card of await cards.getAll()) {
    if (card.categoryId === id && card.custom) await cards.delete(card.id)
  }
  await tx.done
}

export async function saveSettings(settings: Settings) {
  await (await dbPromise).put('kv', settings, 'settings')
}

export async function resetEverything() {
  const db = await dbPromise
  const tx = db.transaction(['cards', 'categories', 'kv'], 'readwrite')
  await Promise.all([
    tx.objectStore('cards').clear(),
    tx.objectStore('categories').clear(),
    tx.objectStore('kv').clear(),
    tx.done,
  ])
}

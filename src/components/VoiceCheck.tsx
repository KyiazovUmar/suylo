import { useState } from 'react'
import audioManifest from '../data/audio.json'
import { buildSentence, sentenceText } from '../lib/grammar'
import { AND_CARD, helperClip, WITH_CARD } from '../lib/library'
import { speak, unlockAudio } from '../lib/speech'
import { useStore } from '../lib/store'
import type { Card } from '../types'

// Open the app with ?voices to hear every word of the simple boards — the final take, the mid-sentence take and
// each form («апама», «муну», «сыртта») — and a few sentences, and to mark the ones that sound wrong.
// The marks stay in this browser; «Көчүрүү» copies the list to send.

const BASE = import.meta.env.BASE_URL
const has = new Set(audioManifest.ids)
const clip = (id: string) => (has.has(id) ? `${BASE}audio/${id}.${audioManifest.ext}` : undefined)
const KEY = 'suylo-voice-marks'

const SENTENCES = [
  ['me', 'want', 'water'],
  ['me', 'eat', 'bread'],
  ['me', 'mom', 'go'],
  ['me', 'you', 'like'],
  ['me', 'this', 'want'],
  ['this', 'open'],
  ['what', 'this'],
  ['me', 'outside', 'play-verb'],
  ['me', 'go-toilet'],
  ['me', 'head'],
  ['mom', 'help'],
  ['more', 'water'],
]

function loadMarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function VoiceCheck() {
  const { ready, boards, library } = useStore()
  const [marks, setMarks] = useState<string[]>(loadMarks)
  const [copied, setCopied] = useState(false)
  if (!ready) return null

  const toggle = (id: string) => {
    const next = marks.includes(id) ? marks.filter((m) => m !== id) : [...marks, id]
    setMarks(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // private mode: the marks just are not remembered
    }
  }
  const play = (text: string, audio?: string) => {
    unlockAudio()
    void speak([{ text, audio, suylo: true }])
  }
  const cards = new Map(library.flatMap((c) => c.cards).map((c) => [c.id, c]))
  const row = (id: string, label: string, takes: { name: string; url?: string }[]) => (
    <li key={id} className={`vc-row${marks.includes(id) ? ' is-marked' : ''}`}>
      <span className="vc-label">{label}</span>
      {takes.map((t) => (
        <button key={t.name} type="button" className="btn btn--soft btn--small" disabled={!t.url} onClick={() => play(label, t.url)}>
          ▶ {t.name}
        </button>
      ))}
      <label className="vc-mark">
        <input type="checkbox" checked={marks.includes(id)} onChange={() => toggle(id)} /> туура эмес
      </label>
    </li>
  )
  const wordRows = (card: Card) => [
    row(card.id, card.label, [
      { name: 'аягы', url: clip(card.id) },
      { name: 'ортосу', url: clip(`${card.id}--mid`) },
    ]),
    ...Object.entries(card.forms ?? {}).map(([form, f]) => row(`${card.id}--${form}`, f!.label, [{ name: 'форма', url: f!.audio }])),
  ]

  return (
    <div className="voice-check">
      <h1>Сүйлөнүн үнүн текшерүү</h1>
      <p className="muted">
        Ар бир сөздү угуп, туура эмес айтылганын белгилеңиз. «аягы» — сүйлөмдүн аягындагы үн, «ортосу» — сүйлөмдүн ортосундагы үн.
      </p>
      <button
        type="button"
        className="btn btn--primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(marks.join(', ') || '—')
            setCopied(true)
          } catch {
            prompt('Көчүрүңүз:', marks.join(', '))
          }
        }}
      >
        Көчүрүү ({marks.length}) {copied && '✓'}
      </button>

      <h2>Сүйлөмдөр</h2>
      <ul className="vc-list">
        {SENTENCES.map((ids) => {
          const taps = ids.map((id, i) => ({ key: i + 1, card: cards.get(id)! })).filter((t) => t.card)
          const toks = buildSentence(taps, { and: AND_CARD, with: WITH_CARD, lookup: (id) => cards.get(id), clip: helperClip }, 'form')
          const text = sentenceText(toks)
          const said = toks.filter((t) => !t.dropped)
          return (
            <li key={ids.join('+')} className={`vc-row${marks.includes(text) ? ' is-marked' : ''}`}>
              <span className="vc-label">{text}</span>
              <button
                type="button"
                className="btn btn--soft btn--small"
                onClick={() => {
                  unlockAudio()
                  void speak(said.map(({ card, punct }) => ({ text: card.label, audio: card.audio, audioMid: card.audioMid, say: card.say, suylo: true, punct, parts: card.parts })))
                }}
              >
                ▶
              </button>
              <label className="vc-mark">
                <input type="checkbox" checked={marks.includes(text)} onChange={() => toggle(text)} /> туура эмес
              </label>
            </li>
          )
        })}
      </ul>

      {boards.map((b) => (
        <section key={b.id}>
          <h2>{b.label}</h2>
          <ul className="vc-list">{b.slots.flatMap((c) => (c ? wordRows(c) : []))}</ul>
        </section>
      ))}
    </div>
  )
}

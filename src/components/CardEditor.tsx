import { useEffect, useMemo, useRef, useState } from 'react'
import { t, wordTypeLabels } from '../i18n'
import { builtinAudioUrl, builtinImage, newId, PLACEHOLDER_IMAGE } from '../lib/library'
import { packAudio, packImage } from '../lib/pack'
import { resizeImage } from '../lib/media'
import { speak, stop } from '../lib/speech'
import { useStore } from '../lib/store'
import type { Card, WordType } from '../types'
import { IconCamera, IconImage, IconPlay, IconUndo } from './Icons'
import { Recorder } from './Recorder'

// undefined = leave as is, null = go back to Suylo's original, Blob = parent's new one.
type Edit<T> = T | null | undefined

interface Props {
  card?: Card
  categoryId: string
  onClose: () => void
  /** Told the card's id once it is saved (a new word placed straight into a board slot). */
  onSaved?: (id: string) => void
}

const TYPES: WordType[] = ['noun', 'verb', 'person', 'describe', 'social', 'negation', 'phrase', 'pronoun']

// Big-dictionary cards keep their original picture and voice under /pack/.
const isPackCard = (card: Card) => card.categoryId.startsWith('pk-')
const originalImage = (card: Card) => (isPackCard(card) ? packImage(card.id) : builtinImage(card.id))
const originalAudio = (card: Card) => (isPackCard(card) ? packAudio(card.id) : builtinAudioUrl(card.id))

function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  return url
}

export function CardEditor({ card, categoryId, onClose, onSaved }: Props) {
  const { cardRecord, saveCard, removeCard } = useStore()
  const isNew = !card
  const builtin = card?.builtin ?? false
  const existing = card ? cardRecord(card.id) : undefined

  const [label, setLabel] = useState(card?.label ?? '')
  const [type, setType] = useState<WordType>(card?.type ?? 'noun')
  const [hidden, setHidden] = useState(card?.hidden ?? false)
  const [image, setImage] = useState<Edit<Blob>>(undefined)
  const [audio, setAudio] = useState<Edit<Blob>>(undefined)
  const [saving, setSaving] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  const newImageUrl = useObjectUrl(image)
  const newAudioUrl = useObjectUrl(audio)

  const imageUrl =
    image === null ? originalImage(card!) : (newImageUrl ?? (card?.image || PLACEHOLDER_IMAGE))
  const imageChanged = image !== undefined ? image !== null : !!existing?.image
  const audioUrl = audio === null ? originalAudio(card!) : (newAudioUrl ?? card?.audio)
  const audioSource: Card['audioSource'] =
    audio instanceof Blob ? 'parent' : audio === null ? (audioUrl ? 'suylo' : 'none') : (card?.audioSource ?? 'none')

  useEffect(() => () => stop(), [])

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    try {
      setImage(await resizeImage(file))
    } catch {
      setImage(file)
    }
  }

  const save = async () => {
    if (!label.trim()) return
    setSaving(true)
    const keep = <T,>(edit: Edit<T>, current: T | undefined) => (edit === undefined ? current : (edit ?? undefined))
    const id = card?.id ?? newId('card')
    await saveCard({
      id,
      categoryId: card?.categoryId ?? categoryId,
      custom: !builtin,
      // a built-in word is only stored when renamed, so later fixes to Suylo's word still reach it
      label: card && !existing?.label && label.trim() === card.label ? undefined : label.trim(),
      type,
      hidden,
      image: keep(image, existing?.image),
      audio: keep(audio, existing?.audio),
      suyloAudio: existing?.suyloAudio,
      suyloAudioLabel: existing?.suyloAudioLabel,
    })
    onSaved?.(id)
    onClose()
  }

  const remove = async () => {
    if (!card || builtin || !confirm(t.confirmDeleteCard)) return
    await removeCard(card.id)
    onClose()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{isNew ? t.newCard : t.editCard}</h2>

        <div className="editor">
          <section className="editor-preview">
            <div className={`card card--grid type--${type} preview-card`}>
              <span className="card-img">
                <img src={imageUrl} alt="" />
              </span>
              <span className="card-label">{label || '…'}</span>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn--soft" onClick={() => cameraInput.current?.click()}>
                <IconCamera />
                {t.takePhoto}
              </button>
              <button type="button" className="btn btn--soft" onClick={() => galleryInput.current?.click()}>
                <IconImage />
                {t.fromGallery}
              </button>
              {builtin && imageChanged && (
                <button type="button" className="btn btn--ghost" onClick={() => setImage(null)}>
                  <IconUndo />
                  {t.restorePicture}
                </button>
              )}
            </div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          </section>

          <section className="editor-fields">
            <label className="field">
              <span className="field-label">{t.word}</span>
              <input className="input" value={label} placeholder={t.wordPlaceholder} onChange={(e) => setLabel(e.target.value)} autoFocus={isNew} />
            </label>

            <div className="field">
              <span className="field-label">{t.voice}</span>
              <p className={`voice-source voice-source--${audioSource}`}>
                {audioSource === 'parent' ? t.voiceParent : audioSource === 'suylo' ? t.voiceSuylo : t.voiceNone}
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--soft"
                  onClick={() => speak([{ text: label, audio: audioUrl }])}
                  disabled={!label.trim()}
                >
                  <IconPlay />
                  {t.play}
                </button>
                <Recorder onRecorded={setAudio} hasRecording={audioSource === 'parent'} />
                {builtin && audioSource === 'parent' && originalAudio(card!) && (
                  <button type="button" className="btn btn--ghost" onClick={() => setAudio(null)}>
                    <IconUndo />
                    {t.restoreVoice}
                  </button>
                )}
              </div>
            </div>

            <div className="field">
              <span className="field-label">{t.wordType}</span>
              <div className="chips">
                {TYPES.map((wt) => (
                  <button key={wt} type="button" className={`chip type--${wt}${wt === type ? ' is-active' : ''}`} onClick={() => setType(wt)}>
                    {wordTypeLabels[wt]}
                  </button>
                ))}
              </div>
            </div>

            <label className="toggle">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              <span className="toggle-ui" />
              <span>{t.hideCard}</span>
            </label>
          </section>
        </div>

        <div className="sheet-actions">
          {!isNew && !builtin && (
            <button type="button" className="btn btn--danger-ghost" onClick={remove}>
              {t.deleteCard}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={!label.trim() || saving}>
            {t.save}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { IconMic, IconStop } from './Icons'

const MAX_SECONDS = 8

interface Props {
  onRecorded: (blob: Blob) => void
  hasRecording: boolean
}

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg']
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m))
}

export function Recorder({ onRecorded, hasRecording }: Props) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      clearInterval(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
    },
    [],
  )

  const stop = () => {
    clearInterval(timer.current)
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  const start = async () => {
    setError('')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      setError(t.micDenied)
      return
    }
    const mimeType = pickMime()
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop())
      setRecording(false)
      if (chunks.length) onRecorded(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
    }
    recorder.current = rec
    rec.start()
    setRecording(true)
    setSeconds(0)
    const started = Date.now()
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000)
      setSeconds(s)
      if (s >= MAX_SECONDS) stop()
    }, 200)
  }

  return (
    <div className="recorder">
      {recording ? (
        <button type="button" className="btn btn--danger is-recording" onClick={stop}>
          <IconStop />
          {t.stopRecording} · 0:{String(seconds).padStart(2, '0')}
        </button>
      ) : (
        <button type="button" className="btn btn--soft" onClick={start}>
          <IconMic />
          {hasRecording ? t.rerecord : t.record}
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

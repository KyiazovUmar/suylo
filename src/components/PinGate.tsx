import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import { hashPin } from '../lib/media'
import { useStore } from '../lib/store'
import { IconBackspace } from './Icons'

const PIN_LENGTH = 4

type Step = 'enter' | 'create' | 'confirm' | 'forgot'

interface Props {
  onUnlock: () => void
  onCancel: () => void
  /** Force setting a new PIN (used for "change PIN" inside settings). */
  changeOnly?: boolean
}

function makeQuestion() {
  const a = 12 + Math.floor(Math.random() * 8)
  const b = 3 + Math.floor(Math.random() * 6)
  return { text: `${a} × ${b} = ?`, answer: a * b }
}

export function PinGate({ onUnlock, onCancel, changeOnly }: Props) {
  const { settings, updateSettings } = useStore()
  const [step, setStep] = useState<Step>(changeOnly || !settings.pinHash ? 'create' : 'enter')
  const [digits, setDigits] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const question = useMemo(makeQuestion, [step])
  const [answer, setAnswer] = useState('')

  const fail = (message: string) => {
    setError(message)
    setDigits('')
    setShake((n) => n + 1)
  }

  useEffect(() => {
    if (digits.length !== PIN_LENGTH) return
    if (step === 'enter') {
      if (hashPin(digits) === settings.pinHash) onUnlock()
      else fail(t.wrongPin)
    } else if (step === 'create') {
      setFirstPin(digits)
      setDigits('')
      setError('')
      setStep('confirm')
    } else if (step === 'confirm') {
      if (digits === firstPin) {
        void updateSettings({ pinHash: hashPin(digits) }).then(onUnlock)
      } else {
        setStep('create')
        fail(t.pinMismatch)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const press = (d: string) => {
    setError('')
    setDigits((cur) => (cur.length < PIN_LENGTH ? cur + d : cur))
  }

  const title = { enter: t.enterPin, create: t.createPin, confirm: t.confirmPin, forgot: t.forgotPinQuestion }[step]

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.forParents}>
      <div className="gate">
        <p className="gate-eyebrow">{t.forParents}</p>
        <h2 className="gate-title">{title}</h2>

        {step === 'forgot' ? (
          <form
            className="gate-forgot"
            onSubmit={(e) => {
              e.preventDefault()
              if (Number(answer) === question.answer) {
                setAnswer('')
                setStep('create')
              } else {
                setAnswer('')
                setShake((n) => n + 1)
              }
            }}
          >
            <p className="gate-question" key={shake}>{question.text}</p>
            <input
              className="input"
              inputMode="numeric"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <p className="gate-note">{t.forgotPinHint}</p>
            <button type="submit" className="btn btn--primary">OK</button>
          </form>
        ) : (
          <>
            <div className={`pin-dots${shake ? ' shake' : ''}`} key={shake}>
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <span key={i} className={i < digits.length ? 'is-filled' : ''} />
              ))}
            </div>
            <p className="gate-error" aria-live="polite">{error}</p>
            <div className="pinpad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} type="button" onClick={() => press(d)}>
                  {d}
                </button>
              ))}
              <span />
              <button type="button" onClick={() => press('0')}>
                0
              </button>
              <button type="button" onClick={() => setDigits((cur) => cur.slice(0, -1))} aria-label={t.backspace}>
                <IconBackspace />
              </button>
            </div>
          </>
        )}

        <div className="gate-footer">
          {step === 'enter' && (
            <button type="button" className="link-btn" onClick={() => setStep('forgot')}>
              {t.forgotPin}
            </button>
          )}
          <button type="button" className="link-btn" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

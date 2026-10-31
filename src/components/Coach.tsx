import { useEffect, useRef } from 'react'
import { t } from '../i18n'

// First-run walkthrough: a spotlight glides from a card, to Suylo, to the parents' gear.
// It never blocks the app — the child really taps the card and Suylo to move on.

const BASE = import.meta.env.BASE_URL

const STEPS = [
  { target: '.grid .card', title: t.coach1Title, text: t.coach1Text },
  { target: '.talk-suylo', title: t.coach2Title, text: t.coach2Text },
  { target: '.hold-btn', title: t.coach3Title, text: t.coach3Text },
]

interface Props {
  step: number
  onFinish: () => void
}

export function Coach({ step, onFinish }: Props) {
  const spotRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLImageElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const current = STEPS[Math.min(step, STEPS.length - 1)]
  const last = step >= STEPS.length - 1

  // Follow the target every frame, so the spotlight stays put while cards animate or the page scrolls.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const el = document.querySelector(current.target)
      const spot = spotRef.current
      const hand = handRef.current
      const bubble = bubbleRef.current
      if (el && spot && hand && bubble) {
        const r = el.getBoundingClientRect()
        const pad = 8
        Object.assign(spot.style, {
          left: `${r.left - pad}px`,
          top: `${r.top - pad}px`,
          width: `${r.width + pad * 2}px`,
          height: `${r.height + pad * 2}px`,
        })
        hand.style.left = `${r.left + r.width / 2 - 26}px`
        hand.style.top = `${r.bottom - 14}px`
        const bw = bubble.offsetWidth
        const bh = bubble.offsetHeight
        const below = r.bottom + 64 + bh < window.innerHeight
        const x = Math.min(window.innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2))
        const y = below ? r.bottom + 64 : Math.max(12, r.top - bh - 18)
        bubble.style.transform = `translate(${x}px, ${y}px)`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [current.target])

  return (
    <div className="coach" aria-live="polite">
      <div className="coach-spot" ref={spotRef} />
      <img className="coach-hand" ref={handRef} src={`${BASE}cards/ui-point.png`} alt="" />
      <div className="coach-bubble" ref={bubbleRef}>
        <div className="coach-card" key={step}>
          <div className="coach-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />
            ))}
          </div>
          <h3>{current.title}</h3>
          <p>{current.text}</p>
          <div className="coach-actions">
            {!last && (
              <button type="button" className="link-btn" onClick={onFinish}>
                {t.coachSkip}
              </button>
            )}
            {last && (
              <button type="button" className="btn btn--primary" onClick={onFinish}>
                {t.coachDone}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

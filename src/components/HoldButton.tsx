import { useRef, useState, type ReactNode } from 'react'

interface Props {
  onHold: () => void
  ms?: number
  label: string
  children: ReactNode
}

/** Fires only after a deliberate press-and-hold, so a child tapping around doesn't open it. */
export function HoldButton({ onHold, ms = 1200, label, children }: Props) {
  const timer = useRef<number | undefined>(undefined)
  const [holding, setHolding] = useState(false)

  const start = () => {
    setHolding(true)
    timer.current = window.setTimeout(() => {
      setHolding(false)
      onHold()
    }, ms)
  }
  const cancel = () => {
    clearTimeout(timer.current)
    setHolding(false)
  }

  return (
    <button
      type="button"
      className={`hold-btn${holding ? ' is-holding' : ''}`}
      style={{ ['--hold-ms' as string]: `${ms}ms` }}
      aria-label={label}
      title={label}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 36 36" className="hold-ring" aria-hidden="true">
        <circle cx="18" cy="18" r="16" />
      </svg>
      {children}
    </button>
  )
}

import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Card } from '../types'

interface Props {
  card: Card
  onPress?: (card: Card, el: HTMLElement) => void
  size?: 'grid' | 'strip'
  active?: boolean
  dimmed?: boolean
  badge?: string
  /** Position in the grid, used to stagger the pop-in. */
  index?: number
}

/** Long words shrink instead of breaking in the middle («кичинеке-й»). */
function wordSize(label: string) {
  const longest = Math.max(...label.split(/\s+/).map((w) => w.length))
  if (longest > 11 || label.length > 24) return 'is-xlong'
  if (longest > 8 || label.length > 14) return 'is-long'
  return ''
}

// Pressing a card tilts it toward the finger (like pushing a real card), then it springs back.
function press(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--tx', String(((e.clientX - r.left) / r.width) * 2 - 1))
  el.style.setProperty('--ty', String(((e.clientY - r.top) / r.height) * 2 - 1))
  el.classList.add('is-pressed')
}

function release(e: ReactPointerEvent<HTMLElement>) {
  e.currentTarget.classList.remove('is-pressed')
}

export function CardTile({ card, onPress, size = 'grid', active, dimmed, badge, index }: Props) {
  const Root = onPress ? 'button' : 'div'
  const handlers = onPress
    ? {
        type: 'button' as const,
        onPointerDown: press,
        onPointerUp: release,
        onPointerLeave: release,
        onPointerCancel: release,
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          e.currentTarget.querySelector('img, .card-word > span')?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.16) rotate(-4deg)' }, { transform: 'scale(1)' }],
            { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
          )
          onPress(card, e.currentTarget)
        },
      }
    : {}
  return (
    <Root
      {...handlers}
      className={`card card--${size} type--${card.type}${card.image ? '' : ' card--text'}${active ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}`}
      style={index !== undefined ? { ['--i' as string]: index } : undefined}
    >
      {card.image ? (
        <>
          <span className="card-img">
            <img src={card.image} alt="" draggable={false} />
          </span>
          <span className={`card-label ${wordSize(card.label)}`}>{card.label}</span>
        </>
      ) : (
        // Words without a picture (for children who read): the word itself fills the card.
        <span className="card-img card-word">
          <span className={wordSize(card.label)}>{card.label}</span>
        </span>
      )}
      {badge && <span className="card-badge">{badge}</span>}
    </Root>
  )
}

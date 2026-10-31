import { useEffect, useId, useRef, useState } from 'react'
import { getPointer } from '../lib/pointer'
import { getLevel, subscribe, type SpeechState } from '../lib/speech'
import type { Mood } from '../types'

export type Face = Mood | 'idle'

// Flat, Duolingo-style palette traced from the Suylo artwork.
const BODY = '#62A8E3'
const SHADE = '#4D92D7'
const SHINE = '#A6D2F8'
const INK = '#262F4D'
const TONGUE = '#E88D87'
const SPARK = '#4B92DD'

export const BODY_PATH =
  'M99 30 C121 30 138 38 150 52 C166 70 185.5 108 185.5 135 C185.5 158 176 172 160 179 C146 185 122 186 98 186 C72 186 46 182 30 172 C19 165 14.7 152 14.7 135 C14.7 108 26 72 44 52 C58 37 78 30 99 30 Z'

const EYES = [70, 130] as const
const EYE_Y = 94

/** Rounded "D" mouth for talking; depth follows `open` (4 = nearly shut, 19 = wide). */
const mouthPath = (open: number) => {
  const b = 98 + open * 1.07
  return `M88 99 C92 97.4 96 98.6 100 97.6 C104 96.6 107.5 96.8 111.5 97.2 C112 ${98 + open * 0.62} 106.5 ${b} 99.5 ${b} C92.5 ${b} 87.5 ${99 + open * 0.58} 88 99 Z`
}

const stroke = { stroke: INK, strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }

/** Talking mouth with the tongue clipped inside it, so it stays tidy at any opening. */
function TalkingMouth({ id, pathRef, tongueRef }: {
  id: string
  pathRef: React.Ref<SVGPathElement>
  tongueRef: React.Ref<SVGEllipseElement>
}) {
  return (
    <g>
      <defs>
        <path id={`${id}p`} ref={pathRef} d={mouthPath(4)} />
        <clipPath id={`${id}c`}>
          <use href={`#${id}p`} />
        </clipPath>
      </defs>
      <use href={`#${id}p`} fill={INK} stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      <ellipse ref={tongueRef} clipPath={`url(#${id}c)`} cx={100} cy={102} rx={8.5} ry={1.7} fill={TONGUE} />
    </g>
  )
}

function Brows({ face }: { face: Face }) {
  switch (face) {
    case 'sad':
      return (
        <g {...stroke} strokeWidth={4.5}>
          <path d="M59 80 L79 75" />
          <path d="M141 80 L121 75" />
        </g>
      )
    case 'angry':
      return (
        <g {...stroke} strokeWidth={4.5}>
          <path d="M59 74 L80 81" />
          <path d="M141 74 L120 81" />
        </g>
      )
    case 'scared':
      return (
        <g {...stroke} strokeWidth={4.5}>
          <path d="M60 77 Q70 70 80 75" />
          <path d="M140 77 Q130 70 120 75" />
        </g>
      )
    default:
      return null
  }
}

function Eyes({ face }: { face: Face }) {
  if (face === 'happy') {
    return (
      <g {...stroke} strokeWidth={5.5}>
        {EYES.map((cx) => (
          <path key={cx} d={`M${cx - 10} ${EYE_Y + 3} Q${cx} ${EYE_Y - 10} ${cx + 10} ${EYE_Y + 3}`} />
        ))}
      </g>
    )
  }
  if (face === 'tired') {
    return (
      <g {...stroke} strokeWidth={5.5}>
        {EYES.map((cx) => (
          <path key={cx} d={`M${cx - 10} ${EYE_Y} Q${cx} ${EYE_Y + 7} ${cx + 10} ${EYE_Y}`} />
        ))}
      </g>
    )
  }
  const r = face === 'scared' ? 11.6 : 10.3
  return (
    <g className="mascot-eyes">
      {EYES.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={EYE_Y} r={r} fill={INK} />
          <circle cx={cx + 3.8} cy={EYE_Y - 4} r={2.6} fill="#fff" />
        </g>
      ))}
    </g>
  )
}

/** Mouth when not talking: always closed — a smile, or the matching feeling. */
function RestingMouth({ face }: { face: Face }) {
  switch (face) {
    case 'happy':
      return <path d="M85 100 Q99.5 115 114 100" {...stroke} strokeWidth={5.5} />
    case 'sad':
      return <path d="M90 108 Q99.5 100 109 108" {...stroke} />
    case 'angry':
      return <path d="M90 106 Q99.5 102.5 109 106" {...stroke} />
    case 'scared':
      return <path d="M90 105 Q94.5 101 99 105 Q103.5 109 108 105" {...stroke} strokeWidth={4.5} />
    case 'tired':
      return <path d="M93 105 Q99.5 107 106 105" {...stroke} />
    default:
      return <path d="M89 102 Q99.5 111 110 102" {...stroke} />
  }
}

/** The three "hi!" strokes from the artwork, drawn in when Suylo is excited. */
function Sparks() {
  return (
    <g className="mascot-sparks" stroke={SPARK} strokeWidth={4.6} strokeLinecap="round" fill="none">
      <path d="M152.4 40.7 L160.1 26.6" pathLength={1} />
      <path d="M162.1 49.2 L175.4 38.2" pathLength={1} />
      <path d="M168.5 60.2 L182.8 56.9" pathLength={1} />
    </g>
  )
}

/** A chunky "!" above the head; the white rim keeps it readable over the blue sky too. */
function Bang() {
  const mark = (
    <>
      <path d="M83 -14 L97 -14 L93.5 12 L86.5 12 Z" />
      <circle cx={90} cy={22} r={5} />
    </>
  )
  return (
    <g className="mascot-bang">
      <g transform="rotate(-10 90 0)">
        <g fill="#fff" stroke="#fff" strokeWidth={7} strokeLinejoin="round">
          {mark}
        </g>
        <g fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round">
          {mark}
        </g>
      </g>
    </g>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface Props {
  size?: number
  className?: string
  onClick?: () => void
  label?: string
  /** White sticker outline so Suylo never melts into a blue background. */
  outlined?: boolean
  /** No idle breathing (for static previews). */
  still?: boolean
  noShadow?: boolean
  /** Force where the eyes look (-1..1 per axis); otherwise Suylo follows the user's pointer. */
  look?: { x: number; y: number }
  /** Expression when not talking. */
  face?: Face
  /** Changing this number makes Suylo hop with a "!" over its head. */
  noticeKey?: number
  /** Gentle "press me" bounce, e.g. when a sentence is waiting to be spoken. */
  beckon?: boolean
}

export function Mascot({
  size = 96,
  className = '',
  onClick,
  label,
  outlined,
  still,
  noShadow,
  look,
  face: faceProp,
  noticeKey = 0,
  beckon,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = `mc${uid}`
  const [speech, setSpeech] = useState<SpeechState>({ speaking: false, mood: null, index: -1 })
  const [afterglow, setAfterglow] = useState<Face | null>(null)
  const [noticing, setNoticing] = useState(false)
  const wasSpeaking = useRef(false)
  const lastMood = useRef<Mood | null>(null)
  const mouthRef = useRef<SVGPathElement>(null)
  const tongueRef = useRef<SVGEllipseElement>(null)
  const squashRef = useRef<SVGGElement>(null)
  const hopRef = useRef<SVGSVGElement>(null)
  const leanRef = useRef<SVGGElement>(null)
  const eyesRef = useRef<SVGGElement>(null)
  const mouthMoveRef = useRef<SVGGElement>(null)
  const lookRef = useRef(look)
  useEffect(() => {
    lookRef.current = look
  })

  useEffect(() => subscribe(setSpeech), [])

  // When Suylo finishes talking it keeps the feeling on its face for a moment (or smiles).
  useEffect(() => {
    if (speech.speaking) {
      wasSpeaking.current = true
      lastMood.current = speech.mood
      setAfterglow(null)
      return
    }
    if (!wasSpeaking.current) return
    wasSpeaking.current = false
    setAfterglow(lastMood.current ?? 'happy')
    const timer = setTimeout(() => setAfterglow(null), 1800)
    return () => clearTimeout(timer)
  }, [speech.speaking, speech.mood])

  // "I noticed!" — a springy hop with a "!" popping above the head.
  useEffect(() => {
    if (!noticeKey) return
    setNoticing(true)
    hopRef.current?.animate(
      [
        { transform: 'translateY(0) scale(1, 1)' },
        { transform: 'translateY(2px) scale(1.12, 0.86)', offset: 0.14 },
        { transform: 'translateY(-16%) scale(0.92, 1.1)', offset: 0.42 },
        { transform: 'translateY(0) scale(1.1, 0.9)', offset: 0.72 },
        { transform: 'translateY(0) scale(0.98, 1.02)', offset: 0.86 },
        { transform: 'translateY(0) scale(1, 1)' },
      ],
      { duration: 620, easing: 'ease-out' },
    )
    const timer = setTimeout(() => setNoticing(false), 1100)
    return () => clearTimeout(timer)
  }, [noticeKey])

  // Alive: eyes follow the pointer, the body leans toward it, and when nobody moves
  // Suylo glances around on his own. Written straight to the DOM every frame.
  useEffect(() => {
    let frame = 0
    const cur = { x: 0, y: 0, lean: 0 }
    let wander = { x: 0, y: 0 }
    let nextWander = 0
    // Where Suylo is on screen, measured a few times a second (not every frame: that made phones lag).
    let rect: DOMRect | null = null
    let measured = 0
    let last = ''
    const tick = (now: number) => {
      let tx = 0
      let ty = 0
      let lean = 0
      const forced = lookRef.current
      const p = getPointer()
      const svg = hopRef.current
      if (forced) {
        tx = forced.x
        ty = forced.y
      } else if (svg && p && now - p.t < 5000) {
        if (!rect || now - measured > 400) {
          rect = svg.getBoundingClientRect()
          measured = now
        }
        const r = rect
        const dx = p.x - (r.left + r.width / 2)
        const dy = p.y - (r.top + r.height * 0.47)
        const d = Math.hypot(dx, dy) || 1
        const k = Math.min(1, d / (r.width * 1.4))
        tx = (dx / d) * k
        ty = (dy / d) * k
        lean = clamp(dx / (window.innerWidth * 0.45), -1, 1)
      } else {
        if (now > nextWander) {
          wander = Math.random() < 0.45 ? { x: 0, y: 0 } : { x: Math.random() * 1.4 - 0.7, y: Math.random() * 0.8 - 0.35 }
          nextWander = now + 1400 + Math.random() * 2600
        }
        tx = wander.x
        ty = wander.y
      }
      cur.x += (tx - cur.x) * 0.16
      cur.y += (ty - cur.y) * 0.16
      cur.lean += (lean - cur.lean) * 0.07
      // only touch the page when something visibly moved
      const key = `${cur.x.toFixed(2)} ${cur.y.toFixed(2)} ${cur.lean.toFixed(2)}`
      if (key === last) {
        frame = requestAnimationFrame(tick)
        return
      }
      last = key
      eyesRef.current?.setAttribute('transform', `translate(${(cur.x * 7).toFixed(2)} ${(cur.y * 6).toFixed(2)})`)
      mouthMoveRef.current?.setAttribute('transform', `translate(${(cur.x * 3).toFixed(2)} ${(cur.y * 2.5).toFixed(2)})`)
      leanRef.current?.setAttribute(
        'transform',
        `translate(${(cur.lean * 4).toFixed(2)} 0) rotate(${(cur.lean * 7).toFixed(2)} 100 186)`,
      )
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Lip sync: mouth opening follows the loudness of the audio, frame by frame, without re-rendering.
  useEffect(() => {
    if (!speech.speaking) return
    const squash = squashRef.current
    let frame = 0
    let smooth = 0
    const tick = () => {
      smooth += (getLevel() - smooth) * 0.45
      const open = 4 + smooth * 15
      mouthRef.current?.setAttribute('d', mouthPath(open))
      tongueRef.current?.setAttribute('cy', String(98 + open * 1.07))
      tongueRef.current?.setAttribute('ry', String(open * 0.42))
      squash?.setAttribute(
        'transform',
        `translate(100 186) scale(${(1 + smooth * 0.05).toFixed(3)} ${(1 - smooth * 0.05).toFixed(3)}) translate(-100 -186)`,
      )
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      squash?.removeAttribute('transform')
    }
  }, [speech.speaking])

  const face: Face = speech.speaking ? (speech.mood ?? 'idle') : (afterglow ?? faceProp ?? 'idle')
  const motion = still
    ? 'still'
    : speech.speaking
      ? 'talking'
      : afterglow === 'happy'
        ? 'happy'
        : beckon && !noticing
          ? 'beckon'
          : 'idle'
  const excited = noticing || (face === 'happy' && !speech.speaking)

  const Root = onClick ? 'button' : 'div'
  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`mascot mascot--${motion} ${className}`}
      style={{ width: size, height: size }}
      aria-label={label ?? 'Suylo'}
    >
      <svg ref={hopRef} viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true" className="mascot-svg">
        <defs>
          <clipPath id={clipId}>
            <path d={BODY_PATH} />
          </clipPath>
        </defs>

        {!noShadow && <ellipse className="mascot-shadow" cx="100" cy="191" rx="62" ry="6.5" fill="#1F2A44" opacity="0.1" />}
        <g ref={leanRef}>
          <g className="mascot-body">
            <g ref={squashRef}>
              {outlined && <path d={BODY_PATH} fill="none" stroke="#fff" strokeWidth="12" strokeLinejoin="round" />}
              {/* Flat shading: a darker crescent along the bottom-right, a shine stroke top-left. */}
              <g clipPath={`url(#${clipId})`}>
                <rect width="200" height="200" fill={SHADE} />
                <path d={BODY_PATH} fill={BODY} transform="translate(-6 -8)" />
                <path d="M34 94 Q38 68 56 52" stroke={SHINE} strokeWidth="7" strokeLinecap="round" fill="none" />
                <circle cx="66.5" cy="44.5" r="3.7" fill={SHINE} />
              </g>
              <g ref={eyesRef}>
                <Brows face={face} />
                <Eyes face={face} />
              </g>
              <g ref={mouthMoveRef}>
                {speech.speaking ? (
                  <TalkingMouth id={`${uid}t`} pathRef={mouthRef} tongueRef={tongueRef} />
                ) : (
                  <RestingMouth face={face} />
                )}
              </g>
            </g>
          </g>
        </g>
        {excited && <Sparks key={`s${noticeKey}`} />}
        {noticing && <Bang key={noticeKey} />}
      </svg>
    </Root>
  )
}

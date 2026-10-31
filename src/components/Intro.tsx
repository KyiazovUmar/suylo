import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n'
import { burst } from '../lib/fx'
import { builtinAudioUrl } from '../lib/library'
import { sfx } from '../lib/sfx'
import { preload, speak, unlockAudio } from '../lib/speech'
import { Mascot, type Face } from './Mascot'

// The opening scene: Suylo drops onto the clouds, notices a light pull-cord, jumps, pulls it,
// and the light floods the screen white — which is where the app itself begins.
//
// Motion is simulated (gravity, bounces, squash-and-stretch spring, pendulum cord) in one
// requestAnimationFrame loop that writes transforms straight to the DOM; a small async
// "director" moves the scene from beat to beat.

interface Props {
  onDone: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

class Aborted extends Error {}

// Where on Suylo's head the cord handle is held, as a fraction of his size from bottom-centre.
const GRAB_X = 0.12
const GRAB_Y = 0.81

// Hand-placed puffs for the cloud banks: [x in % of width, size, lift], sizes relative to Suylo.
const BACK_PUFFS = [
  [-2, 40, 12], [13, 30, 20], [26, 44, 8], [41, 32, 18], [55, 46, 6], [70, 34, 16], [84, 44, 10], [99, 34, 18],
]
const FRONT_PUFFS = [
  [0, 38, 2], [14, 30, -2], [27, 42, 3], [42, 32, -1], [56, 40, 2], [70, 30, -2], [83, 42, 3], [98, 34, 0],
]

export function Intro({ onDone }: Props) {
  const suyloRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const cordRef = useRef<SVGLineElement>(null)
  const cordTexRef = useRef<SVGLineElement>(null)
  const handleRef = useRef<SVGGElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const floodRef = useRef<HTMLDivElement>(null)
  // Kept in a ref so a parent re-render never restarts the scene.
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  const [face, setFace] = useState<Face>('idle')
  // drop → ready (shiny start button waits) → leaving (button pops away) → go (scene continues)
  const [phase, setPhase] = useState<'drop' | 'ready' | 'leaving' | 'go'>('drop')
  const [noticeKey, setNoticeKey] = useState(0)
  const startRef = useRef<() => void>(() => {})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const letsGo = builtinAudioUrl('_go')
  // undefined = Suylo follows the user's pointer; an object = scripted gaze.
  const [look, setLook] = useState<{ x: number; y: number } | undefined>({ x: 0, y: 0.6 })
  const skyRef = useRef<HTMLDivElement>(null)

  // Scene geometry, fixed for the few seconds the intro lasts.
  const geo = useMemo(() => {
    const W = window.innerWidth
    const H = window.innerHeight
    const M = Math.round(Math.min(W * 0.42, H * 0.28, 260))
    const groundY = H * 0.72
    const cx = W / 2
    const ax = Math.min(W - 36, cx + M * 0.8)
    const handleW = M * 0.17
    const handleH = M * 0.3
    const cordRest = groundY - M * 1.55
    return { W, H, M, groundY, cx, ax, handleW, handleH, cordRest }
  }, [])

  useEffect(() => {
    const { H, M, groundY, cx, ax, handleH, cordRest } = geo
    const g = H * 9 // gravity, px/s²: the drop takes about half a second on any screen
    const s = {
      x: 0,
      y: -(groundY + 40), // offset from resting on the cloud; starts above the screen
      vy: 0,
      phys: true,
      bounces: 0,
      restitution: [0.5, 0.3],
      sq: 0,
      sqv: 0,
      sqRest: 0,
      rot: 0,
      cordLen: -(handleH + 40), // handle waits above the screen
      cordV: 0,
      cordTarget: -(handleH + 40),
      ang: 0,
      angV: 0,
      hx: ax,
      hy: 0,
      attached: false,
      falling: false,
      anchorY: -6,
    }
    let landed = () => {}
    let aborted = false
    let last = performance.now()
    let frame = 0

    const grabPoint = (sx: number, sy: number) => ({
      x: cx + s.x + M * GRAB_X * sx,
      y: groundY + s.y - M * GRAB_Y * sy,
    })

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now

      if (s.phys) {
        s.vy += g * dt
        s.y += s.vy * dt
        if (!s.falling && s.y >= 0 && s.vy > 0) {
          const impact = s.vy
          s.y = 0
          s.sqv -= impact * 0.00055
          const e = s.restitution[s.bounces] ?? 0
          if (e && impact > 250) {
            s.vy = -impact * e
            s.bounces++
          } else {
            s.vy = 0
            s.phys = false
            landed()
          }
        }
      }

      // Squash-and-stretch: an underdamped spring that wobbles after each landing.
      const a = -520 * (s.sq - s.sqRest) - 16 * s.sqv
      s.sqv += a * dt
      s.sq = clamp(s.sq + s.sqv * dt, -0.38, 0.3)
      const stretch = s.phys && s.y < 0 ? clamp(Math.abs(s.vy) / 14000, 0, 0.16) : 0
      const sy = 1 + s.sq + stretch
      const sx = 1 - (s.sq + stretch) * 0.7

      if (s.falling) s.anchorY += s.vy * dt
      if (s.attached) {
        const p = grabPoint(sx, sy)
        s.hx = p.x
        s.hy = p.y
      } else {
        // Cord unrolls on a spring and swings like a pendulum.
        const ca = -95 * (s.cordLen - s.cordTarget) - 11 * s.cordV
        s.cordV += ca * dt
        s.cordLen += s.cordV * dt
        s.angV += (-18 * Math.sin(s.ang) - 2.4 * s.angV) * dt
        s.ang += s.angV * dt
        s.hx = ax + Math.sin(s.ang) * s.cordLen
        s.hy = s.anchorY + Math.cos(s.ang) * s.cordLen
      }

      const suylo = suyloRef.current
      if (suylo) suylo.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${s.rot}deg) scale(${sx}, ${sy})`
      const shadow = shadowRef.current
      if (shadow) {
        const k = 1 - clamp(-s.y / (H * 0.6), 0, 0.7)
        shadow.style.transform = `translate3d(${s.x}px, 0, 0) scale(${k * sx}, ${k})`
        shadow.style.opacity = s.falling ? '0' : String(0.55 * k)
      }
      cordRef.current?.setAttribute('x1', String(ax))
      cordRef.current?.setAttribute('y1', String(s.anchorY))
      cordRef.current?.setAttribute('x2', String(s.hx))
      cordRef.current?.setAttribute('y2', String(s.hy))
      cordTexRef.current?.setAttribute('x1', String(ax))
      cordTexRef.current?.setAttribute('y1', String(s.anchorY))
      cordTexRef.current?.setAttribute('x2', String(s.hx))
      cordTexRef.current?.setAttribute('y2', String(s.hy))
      const cordAngle = (Math.atan2(s.hx - ax, s.hy - s.anchorY) * 180) / Math.PI
      handleRef.current?.setAttribute(
        'transform',
        `translate(${s.hx} ${s.hy}) rotate(${-cordAngle}) translate(0 ${s.attached ? -handleH * 0.55 : 0})`,
      )
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    const check = () => {
      if (aborted) throw new Aborted()
    }
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)).then(check)
    const tween = (ms: number, fn: (t: number) => void) =>
      new Promise<void>((resolve) => {
        const start = performance.now()
        const tick = (now: number) => {
          if (aborted) return resolve()
          const t = Math.min(1, (now - start) / ms)
          fn(t)
          if (t < 1) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      }).then(check)

    let flooding = false
    const flood = (ms: number) => {
      if (flooding) return
      flooding = true
      glowRef.current?.animate([{ opacity: 0.6, scale: 1 }, { opacity: 1, scale: 2.2 }], { duration: 260, fill: 'forwards' })
      const el = floodRef.current
      if (!el) return doneRef.current()
      el.style.visibility = 'visible'
      el.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
        duration: ms,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        fill: 'forwards',
      }).onfinish = () => doneRef.current()
    }

    const director = async () => {
      // 1. Drop in: one big springy bounce, one small one, settle.
      await new Promise<void>((resolve) => (landed = resolve))
      check()
      setFace('happy')
      setLook(undefined)
      await wait(420)
      setFace('idle')

      // 2. The shiny start button appears; Suylo waits (following the pointer) until it is pressed.
      setPhase('ready')
      await new Promise<void>((resolve) => (startRef.current = resolve))
      check()

      // 3. «Кеттик!» — a happy little jump — and the pull-cord slides down next to him, swinging a little.
      void speak([{ text: t.letsGo, audio: letsGo }], 'happy')
      s.bounces = 99
      s.phys = true
      s.vy = -H * 1.1
      sfx.boing()
      await wait(450)
      s.cordTarget = cordRest - s.anchorY
      s.angV = 0.55
      sfx.whoosh()
      glowRef.current?.animate([{ opacity: 0 }, { opacity: 0.6 }], { duration: 500, fill: 'forwards' })
      await wait(900)

      // 4. He notices it («!»), looks up and tilts his head.
      setNoticeKey((n) => n + 1)
      sfx.boing()
      setLook({ x: 0.85, y: -0.8 })
      await tween(300, (t) => (s.rot = lerp(0, 6, easeInOutSine(t))))
      await wait(380)

      // 5. Crouch, then leap to the handle.
      s.sqRest = -0.22
      await wait(190)
      s.sqRest = 0
      s.sqv += 2.2
      sfx.boing()
      setFace('happy')
      const from = { x: s.x, y: s.y }
      await tween(290, (t) => {
        const tx = s.hx - (cx + M * GRAB_X)
        const ty = s.hy + handleH * 0.55 - groundY + M * GRAB_Y
        s.x = lerp(from.x, tx, easeInOutSine(t))
        s.y = lerp(from.y, ty, easeOutCubic(t))
        s.rot = lerp(6, 12, t)
      })

      // 6. Grab and pull: gravity takes Suylo back down, stretching the cord… click.
      s.attached = true
      s.bounces = 99
      s.phys = true
      s.vy = 0
      await tween(240, (t) => (s.rot = lerp(12, 0, t)))
      await new Promise<void>((resolve) => {
        landed = resolve
        if (!s.phys) resolve()
      })
      check()

      // 7. Light on. Suylo and the cord tumble down into the clouds as white light floods in.
      sfx.click()
      s.falling = true
      s.phys = true
      s.vy = H * 0.5
      window.setTimeout(() => sfx.shimmer(), 80)
      flood(720)
    }
    director().catch((err) => {
      if (!(err instanceof Aborted)) throw err
    })

    return () => {
      aborted = true
      cancelAnimationFrame(frame)
    }
  }, [geo])

  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
    if (phase === 'ready' && letsGo) preload([letsGo])
  }, [phase, letsGo])

  const start = () => {
    if (phaseRef.current !== 'ready') return
    phaseRef.current = 'leaving'
    unlockAudio()
    sfx.start()
    const r = buttonRef.current?.getBoundingClientRect()
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 14)
    setPhase('leaving')
    window.setTimeout(() => setPhase('go'), 480)
    startRef.current()
  }

  const { W, H, M, groundY, cx, ax, handleW, handleH } = geo
  const floodR = Math.hypot(Math.max(ax, W - ax), H) * 1.05
  // Puffs get wider on wide screens (so the bank stays continuous) but their height follows
  // Suylo, so the clouds only ever hide his feet.
  const unitH = (M * 0.75) / 30
  const unitW = Math.max(M * 0.75, W * 0.17) / 30
  const puff = (x: number, size: number, lift: number) => ({
    left: `${x}%`,
    width: size * unitW,
    height: size * unitH,
    top: -lift * unitH,
  })

  return (
    <div
      className="intro"
      onPointerDown={() => {
        if (phaseRef.current === 'ready') start()
      }}
      onPointerMove={(e) => {
        skyRef.current?.style.setProperty('--px', String(e.clientX / W - 0.5))
        skyRef.current?.style.setProperty('--py', String(e.clientY / H - 0.5))
      }}
      >
      <div className="intro-logo" aria-hidden="true">
        <Mascot size={34} still noShadow />
        <span>suylo</span>
      </div>
      <div className="sky" ref={skyRef}>
        <div className="sky-glow" ref={glowRef} style={{ left: ax }} />
        {['c1', 'c2', 'c3', 'c4', 'c5'].map((c) => (
          <div key={c} className={`cloud-layer ${c}`}>
            <div className="cloud" />
          </div>
        ))}
        <div className="cloud-bank cloud-bank--back" style={{ top: groundY - M * 0.05 }}>
          {BACK_PUFFS.map(([x, size, lift], i) => (
            <span key={i} style={{ ...puff(x, size * 1.25, lift), animationDelay: `${-i * 0.7}s` }} />
          ))}
        </div>
      </div>

      <div className="intro-shadow" ref={shadowRef} style={{ left: cx - M * 0.36, top: groundY - M * 0.06, width: M * 0.72, height: M * 0.12 }} />
      <div className="intro-suylo" ref={suyloRef} style={{ left: cx - M / 2, top: groundY - M, width: M, height: M }}>
        <Mascot size={M} outlined noShadow face={face} look={look} noticeKey={noticeKey} />
      </div>

      <svg className="intro-cord" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="handle-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#FFE58A" />
            <stop offset="0.55" stopColor="#FFCB3D" />
            <stop offset="1" stopColor="#F0A81C" />
          </linearGradient>
        </defs>
        <line ref={cordRef} stroke="#F7F9FF" strokeWidth={3.2} strokeLinecap="round" />
        <line ref={cordTexRef} stroke="rgba(20,40,110,0.18)" strokeWidth={3.2} strokeDasharray="2 6" strokeLinecap="round" />
        <g ref={handleRef}>
          <circle cy={2} r={handleW * 0.2} fill="#F7F9FF" />
          <rect x={-handleW / 2} y={handleW * 0.12} width={handleW} height={handleH} rx={handleW / 2} fill="url(#handle-grad)" stroke="#fff" strokeWidth={3} />
          <rect x={-handleW * 0.22} y={handleW * 0.45} width={handleW * 0.16} height={handleH * 0.55} rx={handleW * 0.08} fill="#fff" opacity={0.6} />
        </g>
      </svg>

      <div className="cloud-bank cloud-bank--front" style={{ top: groundY + M * 0.46 }}>
        {FRONT_PUFFS.map(([x, size, lift], i) => (
          <span key={i} style={{ ...puff(x, size, lift), animationDelay: `${-i * 0.55}s` }} />
        ))}
      </div>

      {(phase === 'ready' || phase === 'leaving') && (
        <button
          ref={buttonRef}
          type="button"
          className={`intro-start${phase === 'leaving' ? ' is-leaving' : ''}`}
          style={{ left: cx, top: groundY + M * 0.32 }}
          onClick={start}
        >
          <span className="intro-start-shine" aria-hidden="true" />
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
          </svg>
          {t.introStart}
        </button>
      )}

      <div className="intro-flood" ref={floodRef} style={{ left: ax - floodR, top: -floodR, width: floodR * 2, height: floodR * 2 }} />
    </div>
  )
}

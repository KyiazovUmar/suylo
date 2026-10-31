// Last place the user pointed (mouse move, or where a finger touched), so Suylo can look at it.

interface PointerSpot {
  x: number
  y: number
  /** performance.now() of the last update */
  t: number
}

let spot: PointerSpot | null = null
let listening = false

function update(e: PointerEvent) {
  spot = { x: e.clientX, y: e.clientY, t: performance.now() }
}

/** The child touched the screen in the last moment (background work waits, so tapping stays smooth). */
export function touchedRecently(ms = 1500) {
  getPointer()
  return !!spot && performance.now() - spot.t < ms
}

export function getPointer(): PointerSpot | null {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener('pointermove', update, { passive: true })
    window.addEventListener('pointerdown', update, { passive: true })
  }
  return spot
}

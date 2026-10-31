/** Shrinks a phone photo (often 12 MP) to something small enough to keep many of in IndexedDB. */
export async function resizeImage(file: Blob, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
  )
}

// The PIN only keeps a child out of settings; it is not a security boundary.
// A plain hash also works over http on a local network, where crypto.subtle is unavailable.
export function hashPin(pin: string) {
  let h = 0x811c9dc5
  for (const ch of `suylo:${pin}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

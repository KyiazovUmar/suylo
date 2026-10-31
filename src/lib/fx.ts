// Little celebration: confetti shapes burst out of a point and fall away.

const COLORS = ['#62A8E3', '#FFD24D', '#4FC775', '#F27BC0', '#FF9F45', '#9B7BF2']

export function burst(x: number, y: number, count = 16) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span')
    el.className = `confetti confetti--${i % 3}`
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.background = COLORS[i % COLORS.length]
    document.body.appendChild(el)
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4
    const dist = 60 + Math.random() * 70
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - 30
    const spin = (Math.random() - 0.5) * 540
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 70}px)) scale(0.6) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    ).onfinish = () => el.remove()
  }
}

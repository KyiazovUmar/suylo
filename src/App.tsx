import { useCallback, useEffect, useState } from 'react'
import { Intro } from './components/Intro'
import { MascotSheet } from './components/MascotSheet'
import { PinGate } from './components/PinGate'
import { Settings } from './components/Settings'
import { Talk } from './components/Talk'
import { VoiceCheck } from './components/VoiceCheck'
import { setSfxEnabled } from './lib/sfx'
import { stop } from './lib/speech'
import { useStore } from './lib/store'

type Screen = 'talk' | 'gate' | 'settings'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App() {
  const { ready, settings } = useStore()
  const [screen, setScreen] = useState<Screen>('talk')
  const [introDone, setIntroDone] = useState(false)
  const finishIntro = useCallback(() => setIntroDone(true), [])
  useEffect(() => setSfxEnabled(settings.soundEffects), [settings.soundEffects])

  if (new URLSearchParams(location.search).has('mascot')) return <MascotSheet />
  if (new URLSearchParams(location.search).has('voices')) return <VoiceCheck />
  if (!ready) return <div className="splash" />
  // Children sensitive to motion (or parents who switched it off) go straight to the cards.
  if (!introDone && settings.intro && !prefersReducedMotion()) return <Intro onDone={finishIntro} />

  return (
    <>
      {screen === 'settings' ? (
        <Settings onClose={() => setScreen('talk')} />
      ) : (
        <Talk
          onOpenSettings={() => {
            stop()
            setScreen('gate')
          }}
        />
      )}
      {screen === 'gate' && <PinGate onUnlock={() => setScreen('settings')} onCancel={() => setScreen('talk')} />}
    </>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/balsamiq-sans/400.css'
import '@fontsource/balsamiq-sans/700.css'
import '@fontsource/pangolin/400.css'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './lib/store.tsx'
import { saveVoicesOffline } from './lib/offline.ts'

// Start fetching the playful fonts immediately, so the intro's wordmark never shows a fallback.
void document.fonts?.load('400 30px Pangolin')
void document.fonts?.load('700 18px "Balsamiq Sans"')

// Saves the app (code, fonts) so it opens without internet; once that is done, Suylo's pictures and voices
// (they would slow the app's own small download down if fetched at the same time).
registerSW({ immediate: true })
void navigator.serviceWorker?.ready.then(() => saveVoicesOffline())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)

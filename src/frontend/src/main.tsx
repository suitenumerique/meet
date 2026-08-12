import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

const CHUNK_RELOAD_KEY = 'vite-preload-error-reload-at'
const RELOAD_COOLDOWN_MS = 30_000

window.addEventListener('vite:preloadError', (event) => {
  try {
    const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
    if (Date.now() - lastReloadAt <= RELOAD_COOLDOWN_MS) {
      // Recent reload didn't help: not a stale deploy, surface the error.
      return
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // Without sessionStorage we cannot guard against a reload loop:
    // don't auto-reload, let the error propagate.
    return
  }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

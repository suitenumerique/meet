import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { registerPlugin } from '@/features/plugins'
import { bootPlugins } from '@/features/plugins/loader'
import { plugin as transcriptPlugin } from '@/features/recording/transcript.plugin'
import { plugin as screenRecordingPlugin } from '@/features/recording/screenRecording.plugin'

// Composition root: register built-ins (sync) before first render, then boot
// external deploy-time bundles in the background — contributions appear reactively.
registerPlugin(transcriptPlugin)
registerPlugin(screenRecordingPlugin)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

void bootPlugins().catch((error) => {
  console.error('[plugins] boot failed', error)
})

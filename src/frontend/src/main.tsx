import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { registerPlugin } from '@/features/plugins'
import { plugin as transcriptPlugin } from '@/features/recording/transcript.plugin'
import { plugin as screenRecordingPlugin } from '@/features/recording/screenRecording.plugin'

// Composition root: register built-ins (sync) before first render.
registerPlugin(transcriptPlugin)
registerPlugin(screenRecordingPlugin)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

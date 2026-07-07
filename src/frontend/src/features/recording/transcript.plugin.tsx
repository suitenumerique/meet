import { lazy } from 'react'
import { Icon } from '@/primitives'
import { definePlugin } from '@/features/plugins/types'
import type { ApiConfig } from '@/api/useConfig'
import { RecordingMode } from './types'
import { isRecordingModeEnabled } from './hooks/useIsRecordingModeEnabled'

/** Stable id — also the persisted `activeSubPanelId` and `tool-${id}` data-attr. */
export const TRANSCRIPT_PLUGIN_ID = 'recording.transcript'

/** Built-in "Transcribe" sub-panel, expressed as a plugin. */
export const plugin = definePlugin({
  id: TRANSCRIPT_PLUGIN_ID,
  apiVersion: '1.0.0',
  i18nNamespace: 'rooms',
  order: 10,
  isEnabled: (config?: ApiConfig): boolean =>
    isRecordingModeEnabled(config, RecordingMode.Transcript),
  contributes: {
    tool: {
      icon: <Icon type="symbols" name="speech_to_text" />,
      titleKey: 'moreTools.tools.transcript.title',
      descriptionKey: 'moreTools.tools.transcript.body',
      panel: {
        Component: lazy(() =>
          import('./components/TranscriptSidePanel').then((m) => ({
            default: m.TranscriptSidePanel,
          }))
        ),
        headingKey: 'sidePanel.heading.transcript',
        contentKey: 'sidePanel.content.transcript',
      },
    },
  },
})

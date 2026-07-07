import { lazy } from 'react'
import { Icon } from '@/primitives'
import { definePlugin } from '@/features/plugins/types'
import type { ApiConfig } from '@/api/useConfig'
import { RecordingMode } from './types'
import { isRecordingModeEnabled } from './hooks/useIsRecordingModeEnabled'

/** Stable id — also the persisted `activeSubPanelId` and `tool-${id}` data-attr. */
export const SCREEN_RECORDING_PLUGIN_ID = 'recording.screen-recording'

/** Built-in "Record" sub-panel, expressed as a plugin. */
export const plugin = definePlugin({
  id: SCREEN_RECORDING_PLUGIN_ID,
  apiVersion: '1.0.0',
  i18nNamespace: 'rooms',
  order: 20,
  isEnabled: (config?: ApiConfig): boolean =>
    isRecordingModeEnabled(config, RecordingMode.ScreenRecording),
  contributes: {
    tool: {
      icon: <Icon type="symbols" name="mode_standby" />,
      titleKey: 'moreTools.tools.screenRecording.title',
      descriptionKey: 'moreTools.tools.screenRecording.body',
      panel: {
        Component: lazy(() =>
          import('./components/ScreenRecordingSidePanel').then((m) => ({
            default: m.ScreenRecordingSidePanel,
          }))
        ),
        headingKey: 'sidePanel.heading.screenRecording',
        contentKey: 'sidePanel.content.screenRecording',
      },
    },
  },
})

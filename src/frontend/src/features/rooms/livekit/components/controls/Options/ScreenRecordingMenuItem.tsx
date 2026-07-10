import { RiRecordCircleLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { SCREEN_RECORDING_PLUGIN_ID } from '@/features/recording/screenRecording.plugin'
import { FeatureFlags } from '@/features/analytics/enums'
import { useIsToolVisible } from '@/features/plugins'

export const ScreenRecordingMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isSubPanelOpen, openSubPanel, toggleTools } = useSidePanel()

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )
  const isToolVisible = useIsToolVisible(SCREEN_RECORDING_PLUGIN_ID)

  if (!hasScreenRecordingAccess || !isToolVisible) return null

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={() =>
        !isSubPanelOpen(SCREEN_RECORDING_PLUGIN_ID)
          ? openSubPanel(SCREEN_RECORDING_PLUGIN_ID)
          : toggleTools()
      }
    >
      <RiRecordCircleLine size={20} />
      {t('screenRecording')}
    </MenuItem>
  )
}

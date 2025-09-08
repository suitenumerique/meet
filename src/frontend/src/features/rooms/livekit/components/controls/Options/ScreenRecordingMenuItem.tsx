import { RiRecordCircleLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'

export const ScreenRecordingMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isScreenRecordingOpen, openScreenRecording, toggleTools } =
    useSidePanel()

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  if (!hasScreenRecordingAccess) return null

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={() =>
        !isScreenRecordingOpen ? openScreenRecording() : toggleTools()
      }
    >
      <RiRecordCircleLine size={20} />
      {t('screenRecording')}
    </MenuItem>
  )
}

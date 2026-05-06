import { RiRecordCircleLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isEncryptedRoom as checkEncryptedRoom } from '@/features/rooms/api/ApiRoom'

export const ScreenRecordingMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isScreenRecordingOpen, openScreenRecording, toggleTools } =
    useSidePanel()
  const roomData = useRoomData()

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  // Recording not available in encrypted rooms
  if (!hasScreenRecordingAccess || checkEncryptedRoom(roomData)) return null

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

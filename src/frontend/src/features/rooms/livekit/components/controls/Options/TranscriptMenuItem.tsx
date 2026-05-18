import { RiFileTextLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'

export const TranscriptMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isTranscriptOpen, openTranscript, toggleTools } = useSidePanel()
  const roomData = useRoomData()
  const isEncrypted = roomData?.encryption_mode === ApiEncryptionMode.BASIC

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  if (!hasTranscriptAccess) return null

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      isDisabled={isEncrypted}
      onAction={() => {
        if (isEncrypted) return
        if (!isTranscriptOpen) openTranscript()
        else toggleTools()
      }}
    >
      <RiFileTextLine size={20} />
      {t('transcript')}
    </MenuItem>
  )
}

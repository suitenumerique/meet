import { RiRecordCircleLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import {
  EncryptionPhase,
  PauseEncryptionConfirmDialog,
  useEncryptionStatus,
} from '@/features/encryption'

export const ScreenRecordingMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isScreenRecordingOpen, openScreenRecording, toggleTools } =
    useSidePanel()
  const { phase, pauseEncryption } = useEncryptionStatus()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  if (!hasScreenRecordingAccess) return null

  const handlePress = () => {
    if (phase === EncryptionPhase.ENCRYPTED) {
      setConfirmOpen(true)
      return
    }
    if (!isScreenRecordingOpen) openScreenRecording()
    else toggleTools()
  }

  return (
    <>
      <MenuItem
        className={menuRecipe({ icon: true, variant: 'dark' }).item}
        onAction={handlePress}
      >
        <RiRecordCircleLine size={20} />
        {t('screenRecording')}
      </MenuItem>
      <PauseEncryptionConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        reason="recording"
        onConfirm={async () => {
          const ok = await pauseEncryption('recording')
          if (ok) openScreenRecording()
        }}
      />
    </>
  )
}

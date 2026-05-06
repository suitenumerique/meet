import { RiFileTextLine } from '@remixicon/react'
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

export const TranscriptMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isTranscriptOpen, openTranscript, toggleTools } = useSidePanel()
  const { phase, pauseEncryption } = useEncryptionStatus()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  if (!hasTranscriptAccess) return null

  const handlePress = () => {
    if (phase === EncryptionPhase.ENCRYPTED) {
      setConfirmOpen(true)
      return
    }
    if (!isTranscriptOpen) openTranscript()
    else toggleTools()
  }

  return (
    <>
      <MenuItem
        className={menuRecipe({ icon: true, variant: 'dark' }).item}
        onAction={handlePress}
      >
        <RiFileTextLine size={20} />
        {t('transcript')}
      </MenuItem>
      <PauseEncryptionConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        reason="transcript"
        onConfirm={async () => {
          const ok = await pauseEncryption('transcript')
          if (ok) openTranscript()
        }}
      />
    </>
  )
}

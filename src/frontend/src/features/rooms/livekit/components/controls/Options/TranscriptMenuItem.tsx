import { RiFileTextLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { useConfig } from '@/api/useConfig'

export const TranscriptMenuItem = () => {
  const { data } = useConfig()
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isTranscriptOpen, openTranscript, toggleTools } = useSidePanel()

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  if (!hasTranscriptAccess || !data?.show_transcription_button) return null

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={() => (!isTranscriptOpen ? openTranscript() : toggleTools())}
    >
      <RiFileTextLine size={20} />
      {t('transcript')}
    </MenuItem>
  )
}

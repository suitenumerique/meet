import { RiFileTextLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { RecordingMode, useHasRecordingAccess } from '@/features/recording'
import { TRANSCRIPT_PLUGIN_ID } from '@/features/recording/transcript.plugin'
import { FeatureFlags } from '@/features/analytics/enums'
import { useIsToolVisible } from '@/features/plugins'

export const TranscriptMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isSubPanelOpen, openSubPanel, toggleTools } = useSidePanel()

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )
  const isToolVisible = useIsToolVisible(TRANSCRIPT_PLUGIN_ID)

  if (!hasTranscriptAccess || !isToolVisible) return null

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={() =>
        !isSubPanelOpen(TRANSCRIPT_PLUGIN_ID)
          ? openSubPanel(TRANSCRIPT_PLUGIN_ID)
          : toggleTools()
      }
    >
      <RiFileTextLine size={20} />
      {t('transcript')}
    </MenuItem>
  )
}

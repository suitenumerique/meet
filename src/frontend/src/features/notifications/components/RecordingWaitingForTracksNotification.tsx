import { useTranslation } from 'react-i18next'
import { RiHourglassLine } from '@remixicon/react'
import { RecordingMode } from '@/features/recording'
import { useRecordingWaitingForTracks } from '@/features/recording/hooks/useRecordingWaitingForTracks'
import { ToastCard } from './ToastCard'

export const RecordingWaitingForTracksNotification = () => {
  const { t } = useTranslation('notifications')
  const isTranscriptWaiting = useRecordingWaitingForTracks(
    RecordingMode.Transcript
  )
  const isScreenRecordingWaiting = useRecordingWaitingForTracks(
    RecordingMode.ScreenRecording
  )

  if (!isTranscriptWaiting && !isScreenRecordingWaiting) return null

  return (
    <ToastCard role="status" icon={<RiHourglassLine />}>
      {t(
        isTranscriptWaiting
          ? 'transcript.waitingForTracks'
          : 'screenRecording.waitingForTracks'
      )}
    </ToastCard>
  )
}

import { Spinner } from '@/primitives/Spinner'
import { Icon } from '@/primitives'

interface RecordingStatusIconProps {
  isStarted: boolean
  isTranscriptActive: boolean
}

export const RecordingStatusIcon = ({
  isStarted,
  isTranscriptActive,
}: RecordingStatusIconProps) => {
  if (!isStarted) {
    return <Spinner size={20} variant="dark" />
  }

  if (isTranscriptActive) {
    return <Icon name="speech_to_text" />
  }

  return <Icon name="screen_record" />
}

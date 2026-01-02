import { Spinner } from '@/primitives/Spinner'

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
    return <span className="material-symbols">speech_to_text</span>
  }

  return <span className="material-symbols">screen_record</span>
}

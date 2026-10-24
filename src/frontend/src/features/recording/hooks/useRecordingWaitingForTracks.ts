import { useEffect, useState } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { RecordingMode } from '@/features/recording'
import { useRecordingStatuses } from './useRecordingStatuses'

const STARTING_NOTIFICATION_DELAY = 15_000

export const useRecordingWaitingForTracks = (mode: RecordingMode) => {
  const { isStarting } = useRecordingStatuses(mode)
  const tracks = useTracks(
    mode === RecordingMode.Transcript ? [Track.Source.Microphone] : undefined,
    { onlySubscribed: false }
  )
  const [delayElapsed, setDelayElapsed] = useState(false)

  useEffect(() => {
    setDelayElapsed(false)
    if (!isStarting) return

    const timeout = window.setTimeout(
      () => setDelayElapsed(true),
      STARTING_NOTIFICATION_DELAY
    )
    return () => window.clearTimeout(timeout)
  }, [isStarting, mode])

  return isStarting && delayElapsed && tracks.length === 0
}

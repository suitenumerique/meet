/**
 * When the participant who paused encryption sees that *both* recording and
 * transcription have stopped, automatically broadcast `ENCRYPTION_RESUMED`.
 *
 * Other participants don't run this watcher: only the pauser can resume
 * (they're the one with `pausedByMe=true`). If they leave the room, the next
 * leader/admin can manually resume from the Settings panel — or in v1 the
 * room simply stays paused for the rest of the session.
 */
import { useEffect, useRef } from 'react'
import { useIsRecording } from '@livekit/components-react'
import { RecordingMode, useRecordingStatuses } from '@/features/recording'
import { EncryptionPhase } from './encryptionStatusTypes'
import { useEncryptionStatus } from './useEncryptionStatus'

export function EncryptionAutoResumeWatcher() {
  const { phase, pausedByMe, resumeEncryption } = useEncryptionStatus()
  const isLiveKitRecording = useIsRecording()
  const transcriptStatuses = useRecordingStatuses(RecordingMode.Transcript)
  const screenRecStatuses = useRecordingStatuses(RecordingMode.ScreenRecording)

  // Edge guard: avoid resuming on the initial render before anything has
  // actually started. We only resume after we've observed an active state.
  const wasActiveRef = useRef(false)
  const isAnyActive =
    isLiveKitRecording ||
    transcriptStatuses.isActive ||
    screenRecStatuses.isActive

  useEffect(() => {
    if (isAnyActive) {
      wasActiveRef.current = true
    }
  }, [isAnyActive])

  useEffect(() => {
    if (phase !== EncryptionPhase.PAUSED) return
    if (!pausedByMe) return
    if (!wasActiveRef.current) return
    if (isAnyActive) return

    void resumeEncryption()
  }, [phase, pausedByMe, isAnyActive, resumeEncryption])

  return null
}

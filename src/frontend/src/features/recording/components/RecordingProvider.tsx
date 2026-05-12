import { LimitReachedAlertDialog } from './LimitReachedAlertDialog'
import { ErrorAlertDialog } from './ErrorAlertDialog'

// RecordingStateToast removed — the RoomStatusBanner (top-left pill row)
// now shows "Recording in progress" and "Transcription in progress" in the
// same place, so the standalone toast was rendering behind the new pills.

export const RecordingProvider = () => {
  return (
    <>
      <LimitReachedAlertDialog />
      <ErrorAlertDialog />
    </>
  )
}

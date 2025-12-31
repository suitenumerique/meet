import { LimitReachedAlertDialog } from './LimitReachedAlertDialog'
import { RecordingStateToast } from './RecordingStateToast'

export const RecordingProvider = () => {
  return (
    <>
      <RecordingStateToast />
      <LimitReachedAlertDialog />
    </>
  )
}

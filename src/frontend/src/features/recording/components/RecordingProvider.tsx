import { LimitReachedAlertDialog } from './LimitReachedAlertDialog'
import { RecordingStateToast } from './RecordingStateToast'
import { ErrorAlertDialog } from './ErrorAlertDialog'

export const RecordingProvider = () => {
  return (
    <>
      <RecordingStateToast />
      <LimitReachedAlertDialog />
      <ErrorAlertDialog />
    </>
  )
}

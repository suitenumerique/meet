export enum RecordingMode {
  Transcript = 'transcript',
  ScreenRecording = 'screen_recording',
}

export enum RecordingStatus {
  Initiated = 'initiated',
  Active = 'active',
  Stopped = 'stopped',
  Saved = 'saved',
  Aborted = 'aborted',
  FailedToStart = 'failedToStart',
  FailedToStop = 'failedToStop',
  NotificationSucceed = 'notification_succeeded',
  ExternalProcessSuccessful = 'external_process_successful',
  ExternalProcessFailed = 'external_process_failed',
}

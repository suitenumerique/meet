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
  Failed = 'failed',
  FailedToStart = 'failed_to_start',
  FailedToStop = 'failed_to_stop',
  NotificationSucceed = 'notification_succeeded',
  ExternalProcessSuccessful = 'external_process_successful',
  ExternalProcessFailed = 'external_process_failed',
}

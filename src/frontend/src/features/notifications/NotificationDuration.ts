export enum ToastDuration {
  SHORT = 3000,
  MEDIUM = 4000,
  LONG = 5000,
  EXTRA_LONG = 7000,
}

export const NotificationDuration = {
  ALERT: ToastDuration.SHORT,
  MESSAGE: ToastDuration.LONG,
  PARTICIPANT_JOINED: ToastDuration.LONG,
  HAND_RAISED: ToastDuration.LONG,
  LOWER_HAND: ToastDuration.EXTRA_LONG,
  RECORDING_SAVING: ToastDuration.EXTRA_LONG,
  REACTION_RECEIVED: ToastDuration.SHORT,
  RECORDING_REQUESTED: ToastDuration.LONG,
} as const

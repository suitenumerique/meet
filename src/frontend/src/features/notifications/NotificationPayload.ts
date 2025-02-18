import { NotificationType } from './NotificationType'

export interface NotificationPayload {
  type: NotificationType
  data?: {
    emoji?: string
  }
}

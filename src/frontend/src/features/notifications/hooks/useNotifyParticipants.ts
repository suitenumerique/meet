import { useRoomContext } from '@livekit/components-react'
import { breakoutRecipients } from '@/features/breakout/utils/split'
import type { NotificationType } from '../NotificationType'
import type { NotificationPayload } from '../NotificationPayload'

export const useNotifyParticipants = () => {
  const room = useRoomContext()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifyParticipants = async <T extends Record<string, any>>(options: {
    type: NotificationType
    destinationIdentities?: string[]
    additionalData?: T
    reliable?: boolean
  }): Promise<void> => {
    const {
      type,
      destinationIdentities,
      additionalData = {} as T,
      reliable = true,
    } = options

    const payload: NotificationPayload & T = {
      type,
      ...additionalData,
    }

    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(payload))

    // Unaddressed, a notification reaches this browser's room only during a split.
    await room.localParticipant.publishData(data, {
      reliable,
      destinationIdentities: destinationIdentities ?? breakoutRecipients(room),
    })
  }

  return { notifyParticipants }
}

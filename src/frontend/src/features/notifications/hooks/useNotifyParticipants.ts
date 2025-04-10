import { useRoomContext } from '@livekit/components-react'
import { NotificationType } from '../NotificationType'
import { NotificationPayload } from '../NotificationPayload'

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

    await room.localParticipant.publishData(data, {
      reliable,
      destinationIdentities,
    })
  }

  return { notifyParticipants }
}

import useSound from 'use-sound'
import { useSnapshot } from 'valtio'
import { notificationsStore } from '@/stores/notifications'
import type { NotificationType } from '@/features/notifications/NotificationType'

// fixme - handle dynamic audio output changes
export const useNotificationSound = () => {
  const notificationsSnap = useSnapshot(notificationsStore)
  const [play] = useSound('./sounds/notifications.mp3', {
    sprite: {
      participantJoined: [0, 1150],
      handRaised: [1400, 180],
      messageReceived: [1580, 300],
      waiting: [2039, 710],
      success: [2740, 1304],
    },
    volume: notificationsSnap.soundNotificationVolume,
  })
  const triggerNotificationSound = (type: NotificationType) => {
    const isSoundEnabled = notificationsSnap.soundNotifications.get(type)
    if (isSoundEnabled) play({ id: type })
  }
  return { triggerNotificationSound }
}

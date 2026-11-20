import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { notificationsStore } from '@/stores/notifications'
import type { NotificationType } from '@/features/notifications/NotificationType'
import {
  loadNotificationSound,
  playNotificationSound,
} from '@/features/notifications/notificationSound'

// fixme - handle dynamic audio output changes
export const useNotificationSound = () => {
  const notificationsSnap = useSnapshot(notificationsStore)

  useEffect(() => {
    loadNotificationSound().catch(() => {})
  }, [])

  const triggerNotificationSound = (type: NotificationType) => {
    const isSoundEnabled = notificationsSnap.soundNotifications.get(type)
    if (isSoundEnabled) {
      playNotificationSound(type, notificationsSnap.soundNotificationVolume)
    }
  }
  return { triggerNotificationSound }
}

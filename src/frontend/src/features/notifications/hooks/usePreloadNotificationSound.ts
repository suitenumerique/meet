import { useEffect } from 'react'
import { notificationsStore } from '@/stores/notifications'
import { runWhenIdle } from '@/utils/runWhenIdle'
import { loadNotificationSound } from '../notificationSound'

/**
 * Fetch and decode the notification sound while the browser is idle, so it
 * doesn't compete with the room connection and is ready for the first
 * notification. Meant for screens shown before the meeting, e.g. pre-join.
 */
export const usePreloadNotificationSound = () => {
  useEffect(() => {
    const isAnySoundEnabled = Array.from(
      notificationsStore.soundNotifications.values()
    ).some(Boolean)
    const saveData = (navigator as { connection?: { saveData?: boolean } })
      .connection?.saveData
    if (!isAnySoundEnabled || saveData) return

    return runWhenIdle(() => {
      // Best effort: the room loads the sound itself if this fails.
      loadNotificationSound().catch(() => {})
    })
  }, [])
}

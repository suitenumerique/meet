import { proxy, subscribe } from 'valtio'
import { proxyMap } from 'valtio/utils'
import { deserializeToProxyMap, serializeProxyMap } from '@/utils/valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { NotificationType } from '@/features/notifications/NotificationType'
import { reportError } from '@/features/analytics/telemetry'

type State = {
  soundNotifications: Map<NotificationType, boolean>
  soundNotificationVolume: number
}

const DEFAULT_STATE: State = {
  soundNotifications: proxyMap(
    new Map([
      [NotificationType.ParticipantJoined, true],
      [NotificationType.HandRaised, true],
      [NotificationType.MessageReceived, true],
    ])
  ),
  soundNotificationVolume: 0.1,
}

function getNotificationsState(): State {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)
    if (!stored) return DEFAULT_STATE
    const parsed = JSON.parse(stored, deserializeToProxyMap)
    // Ensure all default notification types exist in the recovered state
    return {
      ...DEFAULT_STATE,
      ...parsed,
      soundNotifications: proxyMap(
        new Map(
          Array.from(DEFAULT_STATE.soundNotifications.keys()).map((key) => [
            key,
            parsed.soundNotifications.has(key)
              ? parsed.soundNotifications.get(key)
              : DEFAULT_STATE.soundNotifications.get(key),
          ])
        )
      ),
    }
  } catch (error: unknown) {
    reportError('generic_failure', error, {
      context: '[NotificationsStore] Failed to parse stored settings:',
    })
    return DEFAULT_STATE
  }
}

export const notificationsStore = proxy<State>(getNotificationsState())

subscribe(notificationsStore, () => {
  localStorage.setItem(
    STORAGE_KEYS.NOTIFICATIONS,
    JSON.stringify(notificationsStore, serializeProxyMap)
  )
})

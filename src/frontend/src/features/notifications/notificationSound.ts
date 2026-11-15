import type { Howl } from 'howler'
import type { NotificationType } from './NotificationType'
import notificationSoundSrc from '@/assets/sounds/notifications.mp3'

const NOTIFICATION_SOUND_SPRITE: Record<string, [number, number]> = {
  participantJoined: [0, 1150],
  handRaised: [1400, 180],
  messageReceived: [1580, 300],
  participantWaiting: [2039, 710],
  success: [2740, 1304],
}

let howl: Howl | undefined
let howlPromise: Promise<Howl> | undefined

/**
 * Lazily load howler and the notification sound sprite.
 *
 * The Howl instance is shared by every consumer: whoever calls first triggers
 * the (single) download and decoding of the file, later calls reuse it. It can
 * thus be called ahead of time, e.g. from the pre-join screen, so the sound is
 * ready before the first notification of the meeting.
 */
export const loadNotificationSound = (): Promise<Howl> => {
  if (!howlPromise) {
    howlPromise = import('howler')
      .then(
        ({ Howl }) =>
          new Promise<Howl>((resolve, reject) => {
            const instance = new Howl({
              src: [notificationSoundSrc],
              // The extension is kept by the build, but don't rely on it.
              format: ['mp3'],
              sprite: NOTIFICATION_SOUND_SPRITE,
              onload: () => {
                howl = instance
                resolve(instance)
              },
              onloaderror: (_id, error) => {
                instance.unload()
                reject(new Error(`Notification sound failed to load: ${error}`))
              },
            })
          })
      )
      .catch((error) => {
        // Let a later call retry.
        howlPromise = undefined
        throw error
      })
  }
  return howlPromise
}

/**
 * Play a notification sound, if the sprite is already loaded. A sound which
 * isn't ready is skipped rather than played late.
 */
export const playNotificationSound = (
  type: NotificationType,
  volume: number
) => {
  if (!howl) return
  howl.volume(volume)
  howl.play(type)
}

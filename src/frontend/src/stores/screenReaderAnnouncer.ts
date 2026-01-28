import { proxy } from 'valtio'

export type Politeness = 'polite' | 'assertive'
export type ScreenReaderChannel = 'global' | 'idle'

type ScreenReaderAnnouncement = {
  message: string
  politeness: Politeness
  id: number
}

type ScreenReaderAnnouncerState = {
  announcements: Record<ScreenReaderChannel, ScreenReaderAnnouncement>
}

export const screenReaderAnnouncerStore = proxy<ScreenReaderAnnouncerState>({
  announcements: {
    global: {
      message: '',
      politeness: 'polite',
      id: 0,
    },
    idle: {
      message: '',
      politeness: 'polite',
      id: 0,
    },
  },
})

const channels: ScreenReaderChannel[] = ['global', 'idle']
const announcementTokens: Record<ScreenReaderChannel, number> = {
  global: 0,
  idle: 0,
}
const announcementTimers: Record<
  ScreenReaderChannel,
  ReturnType<typeof setTimeout> | null
> = {
  global: null,
  idle: null,
}
const lastAnnouncementTimes: Record<ScreenReaderChannel, number> = {
  global: 0,
  idle: 0,
}
const MIN_ANNOUNCEMENT_INTERVAL = 300 // Minimum 300ms between announcements

export const announceToScreenReader = (
  message: string,
  politeness: Politeness = 'polite',
  channel: ScreenReaderChannel = 'global'
) => {
  if (!channels.includes(channel)) return

  const now = Date.now()
  const timeSinceLastAnnouncement = now - lastAnnouncementTimes[channel]

  announcementTokens[channel] += 1
  const currentToken = announcementTokens[channel]

  if (announcementTimers[channel]) {
    clearTimeout(announcementTimers[channel]!)
  }

  const delay = Math.max(
    150, // Minimum delay for clear + set sequence
    MIN_ANNOUNCEMENT_INTERVAL - timeSinceLastAnnouncement
  )

  screenReaderAnnouncerStore.announcements[channel] = {
    message: '',
    politeness,
    id: currentToken,
  }

  announcementTimers[channel] = setTimeout(() => {
    if (currentToken !== announcementTokens[channel]) return
    screenReaderAnnouncerStore.announcements[channel] = {
      message,
      politeness,
      id: currentToken,
    }
    lastAnnouncementTimes[channel] = Date.now()
  }, delay)
}

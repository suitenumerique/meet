import { proxy } from 'valtio'

export type Politeness = 'polite' | 'assertive'

type ScreenReaderAnnouncement = {
  message: string
  politeness: Politeness
  id: number
}

type ScreenReaderAnnouncerState = {
  announcement: ScreenReaderAnnouncement
}

export const screenReaderAnnouncerStore = proxy<ScreenReaderAnnouncerState>({
  announcement: {
    message: '',
    politeness: 'polite',
    id: 0,
  },
})

export const announceToScreenReader = (
  message: string,
  politeness: Politeness = 'polite'
) => {
  screenReaderAnnouncerStore.announcement = {
    message,
    politeness,
    id: screenReaderAnnouncerStore.announcement.id + 1,
  }
}


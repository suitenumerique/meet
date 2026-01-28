import { useCallback } from 'react'
import {
  announceToScreenReader,
  type Politeness,
  type ScreenReaderChannel,
} from '@/stores/screenReaderAnnouncer'

export const useScreenReaderAnnounce = () => {
  return useCallback(
    (
      message: string,
      politeness: Politeness = 'polite',
      channel: ScreenReaderChannel = 'global'
    ) => {
      announceToScreenReader(message, politeness, channel)
    },
    []
  )
}

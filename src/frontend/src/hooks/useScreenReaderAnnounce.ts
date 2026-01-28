import { useCallback } from 'react'
import {
  announceToScreenReader,
  type Politeness,
} from '@/stores/screenReaderAnnouncer'

export const useScreenReaderAnnounce = () => {
  return useCallback(
    (message: string, politeness: Politeness = 'polite') => {
      announceToScreenReader(message, politeness)
    },
    []
  )
}


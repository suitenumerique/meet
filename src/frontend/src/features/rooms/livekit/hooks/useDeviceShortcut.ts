import { useMemo } from 'react'
import { Shortcut } from '@/features/shortcuts/types'

export const useDeviceShortcut = (kind: MediaDeviceKind) => {
  return useMemo<Shortcut | undefined>(() => {
    switch (kind) {
      case 'audioinput':
        return {
          key: 'e',
          ctrlKey: true,
        }
      case 'videoinput':
        return {
          key: 'd',
          ctrlKey: true,
        }
      default:
        return undefined
    }
  }, [kind])
}

import { useMemo } from 'react'
import {
  getShortcutDescriptorById,
  ShortcutDescriptor,
} from '@/features/shortcuts/catalog'

export const useDeviceShortcut = (kind: MediaDeviceKind) => {
  return useMemo<ShortcutDescriptor | undefined>(() => {
    switch (kind) {
      case 'audioinput':
        return getShortcutDescriptorById('toggle-microphone')
      case 'videoinput':
        return getShortcutDescriptorById('toggle-camera')
      default:
        return undefined
    }
  }, [kind])
}

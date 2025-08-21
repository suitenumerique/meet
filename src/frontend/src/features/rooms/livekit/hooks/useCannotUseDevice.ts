import { useSnapshot } from 'valtio'
import { useMemo } from 'react'
import { permissionsStore } from '@/stores/permissions'

export const useCannotUseDevice = (kind: MediaDeviceKind) => {
  const {
    isLoading,
    isMicrophoneDenied,
    isMicrophonePrompted,
    isCameraDenied,
    isCameraPrompted,
  } = useSnapshot(permissionsStore)

  return useMemo(() => {
    if (isLoading) return true

    switch (kind) {
      case 'audioinput':
      case 'audiooutput': // audiooutput uses microphone permissions
        return isMicrophoneDenied || isMicrophonePrompted
      case 'videoinput':
        return isCameraDenied || isCameraPrompted

      default:
        return false
    }
  }, [
    kind,
    isLoading,
    isMicrophoneDenied,
    isMicrophonePrompted,
    isCameraDenied,
    isCameraPrompted,
  ])
}

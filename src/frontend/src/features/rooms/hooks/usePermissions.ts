import { useEffect } from 'react'
import { permissionStore } from '@/stores/permissions.ts'
import { useSnapshot } from 'valtio'

export const usePermissionsSync = () => {
  useEffect(() => {
    // fixme - on safari, 'change' event is not trigger
    // fixme - prevent error on old browsers
    const checkPermissions = async () => {
      try {
        const [cameraPermission, microphonePermission] = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' }),
        ])
        permissionStore.cameraPermission = cameraPermission.state
        permissionStore.microphonePermission = microphonePermission.state

        const handleCameraChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionStore.cameraPermission = target.state
        }

        const handleMicrophoneChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionStore.microphonePermission = target.state
        }

        if (!cameraPermission.onchange) {
          cameraPermission.addEventListener('change', handleCameraChange)
        }
        if (!microphonePermission.onchange) {
          microphonePermission.addEventListener(
            'change',
            handleMicrophoneChange
          )
        }

        return () => {
          cameraPermission.removeEventListener('change', handleCameraChange)
          microphonePermission.removeEventListener(
            'change',
            handleMicrophoneChange
          )
        }
      } catch (error) {
        console.error('Error checking permissions:', error)
      }
    }
    checkPermissions()
  }, [])
}

export const usePermissions = () => {
  const permissionSnap = useSnapshot(permissionStore)

  return {
    cameraPermission: permissionSnap.cameraPermission,
    microphonePermission: permissionSnap.microphonePermission,
    isCameraDenied: permissionSnap.cameraPermission == 'denied',
    isCameraPrompted: permissionSnap.cameraPermission == 'prompt',
    isCameraGranted: permissionSnap.cameraPermission == 'granted',
    isMicrophoneDenied: permissionSnap.microphonePermission == 'denied',
    isMicrophonePrompted: permissionSnap.microphonePermission == 'prompt',
    isMicrophoneGranted: permissionSnap.microphonePermission == 'granted',
  }
}

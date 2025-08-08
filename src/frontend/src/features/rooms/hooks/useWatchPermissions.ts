import { useEffect } from 'react'
import { permissionsStore } from '@/stores/permissions'

export const useWatchPermissions = () => {
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let isCancelled = false

    const checkPermissions = async () => {
      try {
        if (!navigator.permissions) {
          if (!isCancelled) {
            permissionsStore.cameraPermission = 'unavailable'
            permissionsStore.microphonePermission = 'unavailable'
          }
          return
        }

        const [cameraPermission, microphonePermission] = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' }),
        ])

        if (isCancelled) return

        permissionsStore.cameraPermission = cameraPermission.state
        permissionsStore.microphonePermission = microphonePermission.state

        const handleCameraChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionsStore.cameraPermission = target.state
        }

        const handleMicrophoneChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionsStore.microphonePermission = target.state
        }

        cameraPermission.addEventListener('change', handleCameraChange)
        microphonePermission.addEventListener('change', handleMicrophoneChange)

        cleanup = () => {
          cameraPermission.removeEventListener('change', handleCameraChange)
          microphonePermission.removeEventListener(
            'change',
            handleMicrophoneChange
          )
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error checking permissions:', error)
        }
      } finally {
        if (!isCancelled) {
          permissionsStore.isLoading = false
        }
      }
    }
    checkPermissions()

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [])
}

import { useEffect, useState } from 'react'

type PermissionState = undefined | 'granted' | 'prompt' | 'denied'

export const usePermissions = () => {
  const [cameraPermission, setCameraPermission] =
    useState<PermissionState>(undefined)
  const [microphonePermission, setMicrophonePermission] =
    useState<PermissionState>(undefined)

  useEffect(() => {
    // fixme - on safari, 'change' event is not trigger
    // fixme - prevent error on old browsers
    const checkPermissions = async () => {
      try {
        const [cameraPermission, microphonePermission] = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' }),
        ])
        setCameraPermission(cameraPermission.state)
        setMicrophonePermission(microphonePermission.state)

        const handleCameraChange = (e: Event) => {
          const target = e.target as PermissionStatus
          setCameraPermission(target.state)
        }

        const handleMicrophoneChange = (e: Event) => {
          const target = e.target as PermissionStatus
          setMicrophonePermission(target.state)
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

  return {
    cameraPermission,
    microphonePermission,
    isCameraDenied: cameraPermission == 'denied',
    isCameraPrompted: cameraPermission == 'prompt',
    isCameraGranted: cameraPermission == 'granted',
    isMicrophoneDenied: microphonePermission == 'denied',
    isMicrophonePrompted: microphonePermission == 'prompt',
    isMicrophoneGranted: microphonePermission == 'granted',
  }
}

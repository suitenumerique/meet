import { useEffect } from 'react'
import { permissionsStore } from '@/stores/permissions'
import { isSafari } from '@/utils/livekit'

const POLLING_TIME = 500

export const useWatchPermissions = () => {
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let intervalId: NodeJS.Timeout | undefined
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

        /**
         * Safari Permission API Limitation Workaround
         *
         * Safari has a known issue where permission change events are not reliably fired
         * when users interact with permission prompts. This is documented in Apple's forums:
         * https://developer.apple.com/forums/thread/757353
         *
         * The problem:
         * - When permissions are in 'prompt' state, Safari may not trigger 'change' events
         * - Users can grant/deny permissions through system prompts, but our listeners won't detect it
         * - This leaves the UI in an inconsistent state showing outdated permission status
         *
         * The solution:
         * - Manually poll the Permissions API every 500ms when either permission is in 'prompt' state
         * - Continue polling until both permissions are no longer in 'prompt' state
         * - This ensures we catch permission changes even when Safari fails to fire events
         *
         * This polling is Safari-specific and only activates when needed to minimize performance impact.
         */
        if (
          isSafari() &&
          (cameraPermission.state === 'prompt' ||
            microphonePermission.state === 'prompt')
        ) {
          // Start polling every 1 second if either permission is in 'prompt' state
          if (!intervalId) {
            intervalId = setInterval(async () => {
              try {
                const [updatedCamera, updatedMicrophone] = await Promise.all([
                  navigator.permissions.query({ name: 'camera' }),
                  navigator.permissions.query({ name: 'microphone' }),
                ])

                if (isCancelled) return

                const cameraChanged =
                  permissionsStore.cameraPermission !== updatedCamera.state
                const microphoneChanged =
                  permissionsStore.microphonePermission !==
                  updatedMicrophone.state

                if (cameraChanged) {
                  permissionsStore.cameraPermission = updatedCamera.state
                }

                if (microphoneChanged) {
                  permissionsStore.microphonePermission =
                    updatedMicrophone.state
                }

                if (
                  updatedCamera.state !== 'prompt' &&
                  updatedMicrophone.state !== 'prompt'
                ) {
                  if (intervalId) {
                    clearInterval(intervalId)
                    intervalId = undefined
                  }
                }
              } catch (error) {
                if (!isCancelled) {
                  console.error('Error polling permissions:', error)
                }
              }
            }, POLLING_TIME)
          }
        }

        permissionsStore.cameraPermission = cameraPermission.state
        permissionsStore.microphonePermission = microphonePermission.state

        const handleCameraChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionsStore.cameraPermission = target.state

          if (
            intervalId &&
            target.state !== 'prompt' &&
            microphonePermission.state !== 'prompt'
          ) {
            clearInterval(intervalId)
            intervalId = undefined
          }
        }

        const handleMicrophoneChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionsStore.microphonePermission = target.state

          if (
            intervalId &&
            target.state !== 'prompt' &&
            microphonePermission.state !== 'prompt'
          ) {
            clearInterval(intervalId)
            intervalId = undefined
          }
        }

        cameraPermission.addEventListener('change', handleCameraChange)
        microphonePermission.addEventListener('change', handleMicrophoneChange)

        cleanup = () => {
          cameraPermission.removeEventListener('change', handleCameraChange)
          microphonePermission.removeEventListener(
            'change',
            handleMicrophoneChange
          )
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = undefined
          }
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

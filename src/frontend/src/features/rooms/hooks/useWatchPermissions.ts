import { useEffect } from 'react'
import { permissionsStore } from '@/stores/permissions'
import { hasUnreliablePermissionsEvents } from '@/utils/livekit'

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

        let cameraPermission: PermissionStatus | null = null
        let microphonePermission: PermissionStatus | null = null

        try {
          cameraPermission = await navigator.permissions.query({
            name: 'camera' as PermissionName,
          })
        } catch {
          if (!isCancelled) {
            permissionsStore.cameraPermission = 'prompt'
          }
        }

        try {
          microphonePermission = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          })
        } catch {
          if (!isCancelled) {
            permissionsStore.microphonePermission = 'prompt'
          }
        }

        if (isCancelled) return

        /**
         * Browser Permission API Limitation Workaround
         *
         * Several browsers have known issues where permission change events are not
         * reliably fired when users interact with permission prompts:
         * - Safari: https://developer.apple.com/forums/thread/757353
         * - All iOS browsers (they use WebKit under Apple's policy)
         * - Firefox on Android
         *
         * The problem:
         * - When permissions are in 'prompt' state, these browsers may not trigger 'change' events
         * - Users can grant/deny permissions through system prompts, but our listeners won't detect it
         * - This leaves the UI in an inconsistent state showing outdated permission status
         *
         * The solution:
         * - Manually poll the Permissions API every 500ms when either permission is in 'prompt' state
         * - Continue polling until both permissions are no longer in 'prompt' state
         * - This ensures we catch permission changes even when browsers fail to fire events
         *
         * This polling only activates on affected browsers and when needed to minimize performance impact.
         */
        const needsPolling =
          hasUnreliablePermissionsEvents() &&
          ((cameraPermission?.state ?? 'prompt') === 'prompt' ||
            (microphonePermission?.state ?? 'prompt') === 'prompt')

        if (needsPolling) {
          if (!intervalId) {
            intervalId = setInterval(async () => {
              try {
                let updatedCameraState: PermissionState | null = null
                let updatedMicrophoneState: PermissionState | null = null

                try {
                  const updatedCamera = await navigator.permissions.query({
                    name: 'camera' as PermissionName,
                  })
                  updatedCameraState = updatedCamera.state
                } catch {
                  // Permission query not supported, keep current state
                }

                try {
                  const updatedMicrophone = await navigator.permissions.query({
                    name: 'microphone' as PermissionName,
                  })
                  updatedMicrophoneState = updatedMicrophone.state
                } catch {
                  // Permission query not supported, keep current state
                }

                if (isCancelled) return

                if (
                  updatedCameraState &&
                  permissionsStore.cameraPermission !== updatedCameraState
                ) {
                  permissionsStore.cameraPermission = updatedCameraState
                }

                if (
                  updatedMicrophoneState &&
                  permissionsStore.microphonePermission !==
                    updatedMicrophoneState
                ) {
                  permissionsStore.microphonePermission = updatedMicrophoneState
                }

                // Stop polling when both permissions are resolved
                // or when both queries are unsupported (both null)
                const cameraResolved =
                  updatedCameraState === null ||
                  updatedCameraState !== 'prompt'
                const microphoneResolved =
                  updatedMicrophoneState === null ||
                  updatedMicrophoneState !== 'prompt'

                if (cameraResolved && microphoneResolved) {
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

        if (cameraPermission) {
          permissionsStore.cameraPermission = cameraPermission.state
        }
        if (microphonePermission) {
          permissionsStore.microphonePermission = microphonePermission.state
        }

        const handleCameraChange = (e: Event) => {
          const target = e.target as PermissionStatus
          permissionsStore.cameraPermission = target.state

          if (
            intervalId &&
            target.state !== 'prompt' &&
            (microphonePermission?.state ?? 'prompt') !== 'prompt'
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
            (cameraPermission?.state ?? 'prompt') !== 'prompt'
          ) {
            clearInterval(intervalId)
            intervalId = undefined
          }
        }

        if (cameraPermission) {
          cameraPermission.addEventListener('change', handleCameraChange)
        }
        if (microphonePermission) {
          microphonePermission.addEventListener(
            'change',
            handleMicrophoneChange
          )
        }

        cleanup = () => {
          if (cameraPermission) {
            cameraPermission.removeEventListener('change', handleCameraChange)
          }
          if (microphonePermission) {
            microphonePermission.removeEventListener(
              'change',
              handleMicrophoneChange
            )
          }
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

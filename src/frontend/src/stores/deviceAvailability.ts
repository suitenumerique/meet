import { proxy } from 'valtio'
import { captureMediaEvent, reportError } from '@/features/analytics/telemetry'

// Device presence (not permission): enumerateDevices() exposes kinds
// before any grant. Optimistic defaults until the first sync.
export const deviceAvailabilityStore = proxy({
  hasCamera: true,
  hasMicrophone: true,
  synced: false,
})

export const syncDeviceAvailability = async (): Promise<void> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasCamera = devices.some((d) => d.kind === 'videoinput')
    const hasMicrophone = devices.some((d) => d.kind === 'audioinput')

    // Report each absence once, not on every devicechange.
    const firstSync = !deviceAvailabilityStore.synced
    if (!hasCamera && (firstSync || deviceAvailabilityStore.hasCamera)) {
      void captureMediaEvent('device-not-found', { kind: 'videoinput' })
    }
    if (
      !hasMicrophone &&
      (firstSync || deviceAvailabilityStore.hasMicrophone)
    ) {
      void captureMediaEvent('device-not-found', { kind: 'audioinput' })
    }

    deviceAvailabilityStore.hasCamera = hasCamera
    deviceAvailabilityStore.hasMicrophone = hasMicrophone
    deviceAvailabilityStore.synced = true
  } catch (error) {
    reportError('permissions_api_failure', error as Error, {
      context: 'enumerateDevices for device availability',
    })
  }
}

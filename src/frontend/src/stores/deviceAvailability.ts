import { proxy } from 'valtio'
import { captureMediaEvent, reportError } from '@/features/analytics/telemetry'
import type { PermissionKind } from './permissions'

// Device availability (not permission):
// - presence: enumerateDevices() exposes kinds before any grant.
//   Optimistic defaults until the first sync.
// - in use: the device exists and is allowed, but getUserMedia() failed
//   because another application or tab is holding it. The id of the
//   affected device is kept (when known) so that a selection change can
//   invalidate a flag that no longer concerns the selected device.
export const deviceAvailabilityStore = proxy<{
  hasCamera: boolean
  hasMicrophone: boolean
  cameraInUse: boolean
  microphoneInUse: boolean
  cameraInUseDeviceId?: string
  microphoneInUseDeviceId?: string
  synced: boolean
}>({
  hasCamera: true,
  hasMicrophone: true,
  cameraInUse: false,
  microphoneInUse: false,
  synced: false,
})

const IN_USE_KEY: Record<PermissionKind, 'cameraInUse' | 'microphoneInUse'> = {
  camera: 'cameraInUse',
  microphone: 'microphoneInUse',
}

const IN_USE_DEVICE_KEY: Record<
  PermissionKind,
  'cameraInUseDeviceId' | 'microphoneInUseDeviceId'
> = {
  camera: 'cameraInUseDeviceId',
  microphone: 'microphoneInUseDeviceId',
}

const ALL_KINDS: PermissionKind[] = ['camera', 'microphone']

export const noteDeviceInUse = (kind?: PermissionKind, deviceId?: string) => {
  for (const k of kind ? [kind] : ALL_KINDS) {
    deviceAvailabilityStore[IN_USE_KEY[k]] = true
    deviceAvailabilityStore[IN_USE_DEVICE_KEY[k]] = deviceId
  }
}

export const clearDeviceInUse = (kind?: PermissionKind) => {
  for (const k of kind ? [kind] : ALL_KINDS) {
    deviceAvailabilityStore[IN_USE_KEY[k]] = false
    deviceAvailabilityStore[IN_USE_DEVICE_KEY[k]] = undefined
  }
}

export const clearDeviceInUseForOtherDevice = (
  kind: PermissionKind,
  selectedDeviceId?: string
) => {
  const affected = deviceAvailabilityStore[IN_USE_DEVICE_KEY[kind]]
  if (!affected || !selectedDeviceId || affected === selectedDeviceId) return
  clearDeviceInUse(kind)
}

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

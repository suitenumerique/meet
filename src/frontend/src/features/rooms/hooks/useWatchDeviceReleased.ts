import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { deviceAvailabilityStore } from '@/stores/deviceAvailability'
import { probeDeviceReleased } from '../livekit/utils/mediaPermissions'
import type { PermissionKind } from '@/stores/permissions'

const RETRY_INTERVAL_MS = 30_000

/**
 * There is no browser event for "another app released the device", so
 * while a device is flagged in use, re-probe it periodically. Only clears
 * the flag (the toggle becomes usable again); it never re-enables the
 * device on the user's behalf.
 */
export function useWatchDeviceReleased() {
  const { cameraInUse, microphoneInUse } = useSnapshot(deviceAvailabilityStore)
  useWatchKind('camera', cameraInUse)
  useWatchKind('microphone', microphoneInUse)
}

function useWatchKind(kind: PermissionKind, inUse: boolean) {
  useEffect(() => {
    if (!inUse) return
    const id = setInterval(
      () => void probeDeviceReleased(kind),
      RETRY_INTERVAL_MS
    )
    return () => clearInterval(id)
  }, [kind, inUse])
}

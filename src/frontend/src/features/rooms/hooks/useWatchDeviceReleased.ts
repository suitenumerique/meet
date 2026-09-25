import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import {
  clearDeviceInUseForOtherDevice,
  deviceAvailabilityStore,
} from '@/stores/deviceAvailability'
import { userChoicesStore } from '@/stores/userChoices'
import { probeDeviceReleased } from '../livekit/utils/mediaPermissions'
import type { PermissionKind } from '@/stores/permissions'

const RETRY_INTERVAL_MS = 30_000

/**
 * There is no browser event for "another app released the device", so
 * while a device is flagged in use, re-probe it periodically. The probe
 * targets the currently selected device (the flag is about what the app
 * would acquire, not about any device of the kind). Only clears the flag
 * (the toggle becomes usable again); it never re-enables the device on
 * the user's behalf.
 */
export function useWatchDeviceReleased() {
  const { cameraInUse, microphoneInUse } = useSnapshot(deviceAvailabilityStore)
  const { audioDeviceId, videoDeviceId } = useSnapshot(userChoicesStore)
  useWatchKind('camera', cameraInUse, videoDeviceId)
  useWatchKind('microphone', microphoneInUse, audioDeviceId)
}

function useWatchKind(
  kind: PermissionKind,
  inUse: boolean,
  selectedDeviceId?: string
) {
  useEffect(() => {
    if (inUse) clearDeviceInUseForOtherDevice(kind, selectedDeviceId)
  }, [kind, inUse, selectedDeviceId])

  useEffect(() => {
    if (!inUse) return
    let stopped = false
    let timer: number | undefined
    const tick = async () => {
      await probeDeviceReleased(kind, selectedDeviceId || undefined)
      if (!stopped) {
        timer = window.setTimeout(tick, RETRY_INTERVAL_MS)
      }
    }
    timer = window.setTimeout(tick, RETRY_INTERVAL_MS)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [kind, inUse, selectedDeviceId])
}

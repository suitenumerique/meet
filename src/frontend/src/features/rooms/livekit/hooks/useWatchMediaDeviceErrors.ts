import { useCallback, useEffect, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  type LocalTrackPublication,
  MediaDeviceFailure,
  RoomEvent,
  Track,
} from 'livekit-client'
import {
  PERMISSION_BY_DEVICE_KIND,
  type PermissionDeniedScope,
  type PermissionKind,
  classifyPermissionError,
  isLikelySystemNotFound,
  notePermissionDeniedFromGum,
  noteSystemPermissionDenied,
} from '@/stores/permissions'
import {
  clearDeviceInUse,
  noteDeviceInUse,
  syncDeviceAvailability,
} from '@/stores/deviceAvailability'
import { captureMediaEvent } from '@/features/analytics/telemetry'
import { getOS } from '@/utils/os'

type MediaDeviceAlert = {
  error: MediaDeviceFailure | null
  kind: MediaDeviceKind | null
}

const NO_ALERT: MediaDeviceAlert = { error: null, kind: null }

const PERMISSION_BY_SOURCE: Partial<Record<Track.Source, PermissionKind>> = {
  [Track.Source.Camera]: 'camera',
  [Track.Source.Microphone]: 'microphone',
}

const capturePermissionsDenied = (
  scope: PermissionDeniedScope,
  kind?: PermissionKind
) =>
  captureMediaEvent('permissions-denied', {
    path: 'connect_publish',
    kind,
    denied_scope: scope,
    os: getOS(),
  })

/**
 * Single owner of the room's media device errors
 * (RoomEvent.MediaDevicesError): telemetry, the user-facing alert, device
 * availability refresh, and browser- vs OS-level permission classification.
 * Listens to the raw room event because onMediaDeviceFailure only exposes
 * LiveKit's mapped enum, and the raw error is needed to tell a browser-level
 * denial from an OS-level one (Chromium's "Permission denied by system",
 * Firefox/macOS's NotFoundError).
 */
export const useWatchMediaDeviceErrors = (): MediaDeviceAlert & {
  clear: () => void
} => {
  const room = useRoomContext()
  const [alert, setAlert] = useState<MediaDeviceAlert>(NO_ALERT)

  useEffect(() => {
    const onDeviceError = (error: Error, kind?: MediaDeviceKind) => {
      const failure = MediaDeviceFailure.getFailure(error)
      if (!failure) return
      if (failure != MediaDeviceFailure.Other) {
        void captureMediaEvent('media-device-error', {
          log_code: 'media_devices_error_event',
          path: 'connect_publish',
          failure,
          kind: kind ?? 'unknown',
        })
      }
      if (!kind) return
      const permissionKind = PERMISSION_BY_DEVICE_KIND[kind]
      switch (failure) {
        case MediaDeviceFailure.DeviceInUse:
          if (permissionKind) noteDeviceInUse(permissionKind)
          setAlert({ error: failure, kind })
          break
        case MediaDeviceFailure.NotFound:
          void syncDeviceAvailability()
          // Firefox reports OS-level blocks as NotFoundError (macOS privacy
          // settings, missing Android app permissions).
          void isLikelySystemNotFound(error, permissionKind).then((system) => {
            if (system) {
              noteSystemPermissionDenied(permissionKind)
              void capturePermissionsDenied('system', permissionKind)
            } else {
              setAlert({ error: failure, kind })
            }
          })
          break
        case MediaDeviceFailure.PermissionDenied:
          void classifyPermissionError(error, permissionKind).then((scope) => {
            void capturePermissionsDenied(scope, permissionKind)
            if (scope === 'system') {
              noteSystemPermissionDenied(permissionKind)
            } else {
              notePermissionDeniedFromGum(permissionKind)
            }
          })
          break
        default:
          break
      }
    }
    const onTrackPublished = (publication: LocalTrackPublication) => {
      const permissionKind = PERMISSION_BY_SOURCE[publication.source]
      if (permissionKind) clearDeviceInUse(permissionKind)
    }
    room.on(RoomEvent.MediaDevicesError, onDeviceError)
    room.on(RoomEvent.LocalTrackPublished, onTrackPublished)
    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceError)
      room.off(RoomEvent.LocalTrackPublished, onTrackPublished)
      clearDeviceInUse()
    }
  }, [room])

  const clear = useCallback(() => setAlert(NO_ALERT), [])

  return { ...alert, clear }
}

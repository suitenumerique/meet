import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  MediaDeviceFailure,
} from 'livekit-client'
import {
  classifyPermissionError,
  isLikelySystemNotFound,
  noteGumSuccess,
  notePermissionDeniedFromGum,
  noteSystemPermissionDenied,
  type PermissionKind,
} from '@/stores/permissions'
import { clearDeviceInUse, noteDeviceInUse } from '@/stores/deviceAvailability'
import { captureMediaEvent, reportError } from '@/features/analytics/telemetry'
import { getOS } from '@/utils/os'

/**
 * Shared handling of getUserMedia() outcomes, used by both:
 * - the join preview (`useJoinTracks`: warmup + local track acquisition)
 * - the in-room device toggle (`ToggleDevice`, when permission is missing)
 */
export type MediaPath = 'join_preview' | 'room'

const DEVICE_START_FAILURE =
  /^(Starting (video|audio)input failed|Timeout starting (video|audio) source)/i

/**
 * LiveKit only maps NotReadableError/TrackStartError to DeviceInUse.
 * Firefox reports a device held by another app as
 * `AbortError: Starting videoinput failed` (or audioinput), which LiveKit
 * classifies as Other. Normalise it here; every classification in the app
 * should go through this instead of MediaDeviceFailure.getFailure.
 */
export const getMediaDeviceFailure = (
  error: Error
): MediaDeviceFailure | undefined => {
  const failure = MediaDeviceFailure.getFailure(error)
  if (
    failure === MediaDeviceFailure.Other &&
    error.name === 'AbortError' &&
    DEVICE_START_FAILURE.test(error.message)
  ) {
    return MediaDeviceFailure.DeviceInUse
  }
  return failure
}

export const PERMISSION_KIND: Record<
  'audioinput' | 'videoinput',
  PermissionKind
> = {
  audioinput: 'microphone',
  videoinput: 'camera',
}

export const noteDeviceReady = (kind?: PermissionKind) => {
  noteGumSuccess(kind)
  clearDeviceInUse(kind)
}

export const onMediaPermissionError = (
  e: Error,
  kind?: PermissionKind,
  path: MediaPath = 'join_preview',
  deviceId?: string
) => {
  const failure = getMediaDeviceFailure(e)

  if (failure === MediaDeviceFailure.PermissionDenied) {
    void classifyPermissionError(e, kind).then((scope) => {
      if (scope === 'system') {
        noteSystemPermissionDenied(kind)
      } else {
        notePermissionDeniedFromGum(kind)
      }
      captureMediaEvent('permissions-denied', {
        path,
        kind,
        denied_scope: scope,
        os: getOS(),
      })
    })
    return
  }

  if (failure === MediaDeviceFailure.NotFound) {
    // Firefox reports OS-level blocks as NotFoundError (macOS privacy
    // settings, missing Android app permissions).
    void isLikelySystemNotFound(e, kind).then((system) => {
      if (system) {
        noteSystemPermissionDenied(kind)
        captureMediaEvent('permissions-denied', {
          path,
          kind,
          denied_scope: 'system',
          os: getOS(),
        })
        return
      }
      captureMediaEvent('device-not-found', { path, kind })
    })
    return
  }

  if (failure === MediaDeviceFailure.DeviceInUse) {
    noteDeviceInUse(kind, deviceId)
    void captureMediaEvent('device-in-use', { path, kind, os: getOS() })
    return
  }

  // "Other" is still reported as an error.
  reportError(
    path === 'room' ? 'room_media_failure' : 'join_preview_failure',
    e,
    { path, kind }
  )
}

/**
 * Silent availability check for a device that was reported "in use":
 * acquires and releases it without any error reporting, so it can be
 * polled. Clears the in-use flag on success.
 */
export const probeDeviceReleased = async (
  kind: PermissionKind,
  deviceId?: string
): Promise<boolean> => {
  try {
    const constraint = deviceId ? { deviceId: { exact: deviceId } } : true
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === 'camera' ? { video: constraint } : { audio: constraint }
    )
    stream.getTracks().forEach((track) => track.stop())
    noteDeviceReady(kind)
    return true
  } catch {
    return false
  }
}

/**
 * Triggers the browser permission prompt for one device kind by acquiring
 * and immediately releasing a track. Resolves to whether access was granted.
 */
export const requestDevicePermission = async (
  kind: 'audioinput' | 'videoinput',
  path: MediaPath = 'join_preview',
  deviceId?: string
): Promise<boolean> => {
  try {
    const track =
      kind === 'audioinput'
        ? await createLocalAudioTrack({ deviceId })
        : await createLocalVideoTrack({ deviceId })
    track.stop()
    noteDeviceReady(PERMISSION_KIND[kind])
    return true
  } catch (error) {
    onMediaPermissionError(
      error as Error,
      PERMISSION_KIND[kind],
      path,
      deviceId
    )
    return false
  }
}

import { getPosthog } from './utils'

export const captureEvent = (
  event: string,
  props?: Record<string, unknown>
) => {
  void getPosthog()
    .then((ph) => {
      ph.capture(event, props)
    })
    .catch(() => {
      /* telemetry must never break the app */
    })
  if (import.meta.env.DEV) {
    console.warn(`[telemetry] ${event}`, props)
  }
}

export type LogCode =
  // media
  | 'join_preview_failure'
  | 'room_media_failure'
  | 'livekit_room_error'
  | 'device_switch_failure'
  | 'permission_poll_failure'
  | 'media_devices_error_event'
  // non-media families
  | 'participant_mute_api_failure'
  | 'permissions_api_failure'
  | 'effects_processor_failure'
  | 'clipboard_failure'
  | 'fullscreen_failure'
  | 'publish_sources_failure'
  | 'performance_mode_failure'
  | 'disconnect_failure'
  | 'generic_failure'

export const reportError = (
  logCode: LogCode,
  error: unknown,
  extraInfo: Record<string, unknown> = {}
): void => {
  const e = error instanceof Error ? error : new Error(String(error))
  void getPosthog()
    .then((ph) => {
      ph.captureException(e, {
        log_code: logCode,
        error_name: e.name,
        error_message: e.message,
        ...extraInfo,
      })
    })
    .catch(() => {})
  if (import.meta.env.DEV) {
    console.warn(`[${logCode}]`, e, extraInfo)
  }
}

export interface DeviceSnapshot {
  cam_count: number
  mic_count: number
  out_count: number
  labels_visible: boolean
  saved_cam_present: boolean | null
  saved_mic_present: boolean | null
  saved_video_device_id_set: boolean
  saved_audio_device_id_set: boolean
  audio_enabled: boolean | null
  video_enabled: boolean | null
  cam_permission: PermissionState | 'unknown'
  mic_permission: PermissionState | 'unknown'
}

/** Reads the persisted LiveKit user choices without importing the store. */
const readPersistedChoices = (): {
  videoDeviceId?: string
  audioDeviceId?: string
  videoEnabled?: boolean
  audioEnabled?: boolean
} => {
  try {
    return JSON.parse(localStorage.getItem('lk-user-choices') ?? '{}')
  } catch {
    return {}
  }
}

const queryPermission = async (
  name: 'camera' | 'microphone'
): Promise<PermissionState | 'unknown'> => {
  try {
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    })
    return status.state
  } catch {
    return 'unknown'
  }
}

export const deviceSnapshot = async (): Promise<DeviceSnapshot> => {
  const choices = readPersistedChoices()
  let devices: MediaDeviceInfo[] = []
  try {
    devices = await navigator.mediaDevices.enumerateDevices()
  } catch {
    /* snapshot stays partial */
  }
  const ofKind = (k: MediaDeviceKind) => devices.filter((d) => d.kind === k)
  const present = (k: MediaDeviceKind, id?: string) =>
    id ? ofKind(k).some((d) => d.deviceId === id) : null

  const [cam_permission, mic_permission] = await Promise.all([
    queryPermission('camera'),
    queryPermission('microphone'),
  ])

  return {
    cam_count: ofKind('videoinput').length,
    mic_count: ofKind('audioinput').length,
    out_count: ofKind('audiooutput').length,
    labels_visible: devices.some((d) => !!d.label),
    saved_cam_present: present('videoinput', choices.videoDeviceId),
    saved_mic_present: present('audioinput', choices.audioDeviceId),
    saved_video_device_id_set: !!choices.videoDeviceId,
    saved_audio_device_id_set: !!choices.audioDeviceId,
    audio_enabled: choices.audioEnabled ?? null,
    video_enabled: choices.videoEnabled ?? null,
    cam_permission,
    mic_permission,
  }
}

export const captureMediaEvent = async (
  event:
    | 'media-device-error'
    | 'media-acquisition'
    | 'media-device-topology'
    | 'media-device-success'
    | 'device-not-found'
    | 'permissions-denied'
    | 'screen-share-permission-denied'
    | 'silent-mic-detected'
    | 'silent-mic-analyser-unavailable'
    | 'silent-mic-recovered'
    | 'visit-room'
    | 'connection-event',
  props: Record<string, unknown>
) => {
  captureEvent(event, { ...props, ...(await deviceSnapshot()) })
}

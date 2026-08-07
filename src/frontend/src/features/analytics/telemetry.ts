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
  | 'livekit_room_error'
  | 'device_switch_failure'
  | 'permission_poll_failure'
  // non-media families
  | 'participant_mute_api_failure'
  | 'permissions_api_failure'
  | 'effects_processor_failure'
  | 'clipboard_failure'
  | 'fullscreen_failure'
  | 'publish_sources_failure'
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

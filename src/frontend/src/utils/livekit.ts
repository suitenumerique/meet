import {
  getBrowser,
  LocalParticipant,
  LogLevel,
  Participant,
  setLogLevel,
} from 'livekit-client'

export const silenceLiveKitLogs = (shouldSilenceLogs: boolean) => {
  setLogLevel(shouldSilenceLogs ? LogLevel.silent : LogLevel.debug)
}

export function isFireFox(): boolean {
  return getBrowser()?.name === 'Firefox'
}

export function isChromiumBased(): boolean {
  return getBrowser()?.name === 'Chrome'
}

export function isSafari(): boolean {
  return getBrowser()?.name === 'Safari'
}

/**
 * Detects browsers where the Permissions API change events are unreliable.
 * This includes:
 * - Safari (known issue with permission change events)
 * - All iOS browsers (they all use WebKit under Apple's policy, sharing Safari's limitations)
 * - Firefox (unreliable permission change events on Android)
 */
export function hasUnreliablePermissionsEvents(): boolean {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return isSafari() || isIOS || isFireFox()
}

export function isLocal(p: Participant) {
  return p instanceof LocalParticipant
}

export function isMacintosh() {
  return navigator.platform.indexOf('Mac') > -1
}

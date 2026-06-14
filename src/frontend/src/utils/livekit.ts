import { getBrowser, LocalParticipant, type Participant } from 'livekit-client'

export function isFireFox(): boolean {
  return getBrowser()?.name === 'Firefox'
}

export function isChromiumBased(): boolean {
  return getBrowser()?.name === 'Chrome'
}

export function isSafari(): boolean {
  return getBrowser()?.name === 'Safari'
}

export function isLocal(p: Participant) {
  return p instanceof LocalParticipant
}

export function isMacintosh() {
  return navigator.platform.indexOf('Mac') > -1
}

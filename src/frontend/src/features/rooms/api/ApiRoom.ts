export type ApiLiveKit = {
  url: string
  room: string
  token: string
}

export enum ApiAccessLevel {
  PUBLIC = 'public',
  TRUSTED = 'trusted',
  RESTRICTED = 'restricted',
}

export enum ApiEncryptionMode {
  NONE = 'none',
  BASIC = 'basic',
  ADVANCED = 'advanced',
}

export function isEncryptedRoom(room?: { encryption_mode?: ApiEncryptionMode; encryption_enabled?: boolean } | null): boolean {
  if (!room) return false
  // Support both new encryption_mode and legacy encryption_enabled
  if (room.encryption_mode !== undefined) {
    return room.encryption_mode !== ApiEncryptionMode.NONE
  }
  return !!room.encryption_enabled
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  pin_code: string
  is_administrable: boolean
  access_level: ApiAccessLevel
  encryption_mode: ApiEncryptionMode
  livekit?: ApiLiveKit
  configuration?: {
    [key: string]: string | number | boolean | string[]
  }
}

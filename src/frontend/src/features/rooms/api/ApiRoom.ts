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

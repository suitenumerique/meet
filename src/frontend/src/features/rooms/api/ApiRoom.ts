export type ApiLiveKit = {
  url: string
  room: string
  token: string
}

export enum ApiAccessLevel {
  PUBLIC = 'public',
  RESTRICTED = 'restricted',
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  is_administrable: boolean
  access_level: ApiAccessLevel
  livekit?: ApiLiveKit
  configuration?: {
    [key: string]: string | number | boolean
  }
}

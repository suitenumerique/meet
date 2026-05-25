import type { Track } from 'livekit-client'
type Source = Track.Source

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

export type RoomConfiguration = {
  can_publish_sources?: Source[] | null
  everyone_can_mute?: boolean | null
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  pin_code: string
  is_administrable: boolean
  access_level: ApiAccessLevel
  livekit?: ApiLiveKit
  configuration?: RoomConfiguration
}

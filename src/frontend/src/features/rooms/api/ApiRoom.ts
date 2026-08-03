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

export type ParticipantRole = 'member' | 'administrator' | 'owner'
export type AssignableParticipantRole = Exclude<ParticipantRole, 'owner'>

export type ApiResourceAccess = {
  id: string
  role: ParticipantRole
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  pin_code?: string
  is_administrable: boolean
  access_level: ApiAccessLevel
  livekit?: ApiLiveKit
  configuration?: RoomConfiguration
  /**
   * Only present in the API response when the requesting user is an
   * administrator or owner of the room (see RoomSerializer.to_representation
   * in the backend). Its presence can therefore be used to detect
   * administrability outside of a LiveKit session, where the room_role
   * participant attribute is not available.
   */
  accesses?: ApiResourceAccess[]
}

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

export enum ApiAccessRole {
  MEMBER = 'member',
  ADMIN = 'administrator',
  OWNER = 'owner',
}

export type ApiResourceAccess = {
  id: string
  user: {
    id: string
    email: string
    full_name: string | null
    short_name: string | null
  }
  resource: string
  role: ApiAccessRole
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  pin_code: string
  is_administrable: boolean
  is_owner: boolean
  access_level: ApiAccessLevel
  livekit?: ApiLiveKit
  configuration?: {
    [key: string]: string | number | boolean | string[]
  }
  accesses?: ApiResourceAccess[]
}

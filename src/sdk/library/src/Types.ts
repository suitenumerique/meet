import { DEFAULT_CONFIG } from '@/Config'

export type ConfigType = typeof DEFAULT_CONFIG

export enum ClientMessageType {
  ROOM_CREATED = 'ROOM_CREATED',
  STATE_CLEAR = 'STATE_CLEAR',
}

export type RoomData = {
  slug: string
  url: string
  phone?: string
  code?: string
}

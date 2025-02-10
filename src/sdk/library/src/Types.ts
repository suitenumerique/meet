import { DEFAULT_CONFIG } from '@/Config'

export type ConfigType = typeof DEFAULT_CONFIG

export enum ClientMessageType {
  ROOM_CREATED = 'ROOM_CREATED',
}

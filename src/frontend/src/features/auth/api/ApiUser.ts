import { BackendLanguage } from '@/utils/languages'
import type {
  ApiAccessLevel,
  RoomConfiguration,
} from '@/features/rooms/api/ApiRoom'

export type ApiUser = {
  id: string
  email: string
  full_name: string
  last_name: string
  language: BackendLanguage
  timezone: string
  default_room_access_level?: ApiAccessLevel | null
  default_room_configuration?: RoomConfiguration | null
}

import { BackendLanguage } from '@/utils/languages'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'

export type ApiUser = {
  id: string
  email: string
  full_name: string | null
  short_name: string | null
  last_name: string
  language: BackendLanguage
  timezone: string
  default_encryption_mode: ApiEncryptionMode
}

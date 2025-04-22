import { BackendLanguage } from '@/utils/languages'

export type ApiUser = {
  id: string
  email: string
  full_name: string
  last_name: string
  language: BackendLanguage
  timezone: string
}

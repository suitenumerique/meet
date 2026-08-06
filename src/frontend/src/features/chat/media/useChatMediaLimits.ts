import { useMemo } from 'react'
import { useConfig } from '@/api/useConfig'
import { FALLBACK_ALLOWED_MIMETYPES, FALLBACK_MAX_SIZE } from './constants'

export type ChatMediaLimits = {
  enabled: boolean
  maxSize: number
  allowedMimetypes: string[]
}

/**
 * The backend is authoritative, so an operator can change the cap or narrow the
 * allowlist without a rebuild. The fallbacks apply only before `/config/`
 * answers and when it cannot be reached; they mirror the setting defaults.
 */
export const useChatMediaLimits = (): ChatMediaLimits => {
  const { data: config } = useConfig()
  return useMemo(
    () => ({
      enabled: config?.chat_media?.enabled ?? false,
      maxSize: config?.chat_media?.max_size ?? FALLBACK_MAX_SIZE,
      allowedMimetypes:
        config?.chat_media?.allowed_mimetypes ?? FALLBACK_ALLOWED_MIMETYPES,
    }),
    [config]
  )
}

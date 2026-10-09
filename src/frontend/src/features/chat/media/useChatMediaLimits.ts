import { useMemo } from 'react'
import { useConfig } from '@/api/useConfig'

type ChatMediaLimits = {
  enabled: boolean
  maxSize: number
  allowedMimetypes: string[]
}

/**
 * The backend is authoritative, so an operator can change the cap or narrow the
 * allowlist without a rebuild. Off until `/config/` answers.
 */
export const useChatMediaLimits = (): ChatMediaLimits => {
  const { data: config } = useConfig()
  return useMemo(
    () => ({
      enabled: config?.chat_media?.enabled ?? false,
      maxSize: config?.chat_media?.max_size ?? 0,
      allowedMimetypes: config?.chat_media?.allowed_mimetypes ?? [],
    }),
    [config]
  )
}

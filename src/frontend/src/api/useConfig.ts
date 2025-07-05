import { fetchApi } from './fetchApi'
import { keys } from './queryKeys'
import { useQuery } from '@tanstack/react-query'
import { RecordingMode } from '@/features/recording'

export interface ApiConfig {
  analytics?: {
    id: string
    host: string
  }
  support?: {
    id: string
    help_article_transcript: string
    help_article_recording: string
    help_article_more_tools: string
  }
  feedback: {
    url: string
  }
  transcript: {
    form_beta_users: string
  }
  silence_livekit_debug_logs?: boolean
  is_silent_login_enabled?: boolean
  custom_css_url?: string
  use_french_gov_footer?: boolean
  use_proconnect_button?: boolean
  recording?: {
    is_enabled?: boolean
    available_modes?: RecordingMode[]
    expiration_days?: number
  }
  telephony: {
    enabled: boolean
    phone_number?: string
    default_country?: string
  }
  manifest_link?: string
}

const fetchConfig = (): Promise<ApiConfig> => {
  return fetchApi<ApiConfig>(`config/`)
}

export const useConfig = () => {
  return useQuery({
    queryKey: [keys.config],
    queryFn: fetchConfig,
    staleTime: Infinity,
  })
}

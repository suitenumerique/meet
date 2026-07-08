import { fetchApi } from './fetchApi'
import { keys } from './queryKeys'
import { useQuery } from '@tanstack/react-query'
import { RecordingMode } from '@/features/recording'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import type { Track } from 'livekit-client'
type Source = Track.Source

export interface ApiConfig {
  analytics?: {
    id: string
    host: string
    flags_api_host?: string
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
  external_home_url?: string
  silence_livekit_debug_logs?: boolean
  is_silent_login_enabled?: boolean
  custom_css_url?: string
  use_french_gov_footer?: boolean
  use_proconnect_button?: boolean
  idle_disconnect_warning_delay?: number
  recording?: {
    is_enabled?: boolean
    available_modes?: RecordingMode[]
    expiration_days?: number
    max_duration?: number
  }
  background_image: {
    upload_is_enabled: boolean
    max_size: number
    max_count_by_user: number
    allowed_extensions: string[]
    allowed_mimetypes: string[]
  }
  subtitle: {
    enabled: boolean
  }
  room?: {
    allowed_access_levels: ApiAccessLevel[]
  }
  telephony: {
    enabled: boolean
    international_phone_number?: string
    default_country?: string
  }
  manifest_link?: string
  livekit: {
    url: string
    force_wss_protocol: boolean
    enable_firefox_proxy_workaround: boolean
    default_sources: Source[]
  }
  transcription_destination?: string
  max_participants_for_sound: number
  auto_mute_on_join_threshold: number
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

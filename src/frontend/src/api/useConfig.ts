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
  }
  feedback: {
    url: string
  }
  silence_livekit_debug_logs?: boolean
  is_silent_login_enabled?: boolean
  custom_css?: string
  recording?: {
    is_enabled?: boolean
    available_modes?: RecordingMode[]
    expiration_days?: number
  }
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

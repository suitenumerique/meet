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
  silence_livekit_debug_logs?: boolean
  recording?: {
    is_enabled?: boolean
    available_modes?: RecordingMode[]
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

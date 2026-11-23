import { useConfig } from '@/api/useConfig.ts'
import { isAnalyticsConfigured } from '../utils'

export const useIsAnalyticsEnabled = () => {
  const { data } = useConfig()
  return isAnalyticsConfigured(data?.analytics)
}

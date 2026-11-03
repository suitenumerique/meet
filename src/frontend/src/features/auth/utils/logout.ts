import { apiUrl } from '@/api/apiUrl'
import { terminateAnalyticsSession } from '@/features/analytics/hooks/useAnalytics'

const logoutUrl = () => {
  return apiUrl('/logout')
}

export const logout = async () => {
  await terminateAnalyticsSession()
  window.location.href = logoutUrl()
}

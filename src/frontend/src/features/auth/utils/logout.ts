import { apiUrl } from '@/api/apiUrl'
import { terminateSupportSession } from '@/features/support/hooks/useSupport'
import { terminateAnalyticsSession } from '@/features/analytics/hooks/useAnalytics'

const logoutUrl = () => {
  return apiUrl('/logout')
}

export const logout = async () => {
  await terminateAnalyticsSession()
  terminateSupportSession()
  window.location.href = logoutUrl()
}

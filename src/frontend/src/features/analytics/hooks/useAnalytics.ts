import { useEffect } from 'react'
import { useLocation } from 'wouter'
import posthog from 'posthog-js'
import { ApiUser } from '@/features/auth/api/ApiUser'

export const startAnalyticsSession = (data: ApiUser) => {
  if (posthog._isIdentified()) return
  const { id, email } = data
  posthog.identify(id, { email })
}

export const terminateAnalyticsSession = () => {
  if (!posthog._isIdentified()) return
  posthog.reset()
}

export type useAnalyticsProps = {
  id?: string
  host?: string
  isDisabled?: boolean
}

export const useAnalytics = ({ id, host, isDisabled }: useAnalyticsProps) => {
  const [location] = useLocation()
  useEffect(() => {
    if (!id || !host || isDisabled) return
    if (posthog.__loaded) return
    posthog.init(id, {
      api_host: host,
      person_profiles: 'always',
    })
  }, [id, host, isDisabled])

  // From PostHog tutorial on PageView tracking in a Single Page Application (SPA) context.
  useEffect(() => {
    posthog.capture('$pageview')
  }, [location])

  return null
}

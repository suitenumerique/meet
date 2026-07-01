import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { type PostHog } from 'posthog-js'
import { type ApiUser } from '@/features/auth/api/ApiUser'
import { useUser } from '@/features/auth/api/useUser'

let posthog: PostHog | null = null

const getPosthog = async () => {
  if (!posthog) posthog = (await import('posthog-js')).default
  return posthog
}

export const startAnalyticsSession = (data: ApiUser) => {
  getPosthog().then((ph) => {
    if (ph._isIdentified()) return
    const { id, email } = data
    ph.identify(id, { email })
  })
}

export const terminateAnalyticsSession = async () => {
  const ph = await getPosthog()
  if (!ph._isIdentified()) return
  ph.reset()
}

export type useAnalyticsProps = {
  id?: string
  host?: string
  flags_api_host?: string
  isDisabled?: boolean
}

export const useAnalytics = ({
  id,
  host,
  flags_api_host,
  isDisabled,
}: useAnalyticsProps) => {
  const [location] = useLocation()
  const { user } = useUser()

  useEffect(() => {
    if (!id || !host || isDisabled) return
    getPosthog().then((ph) => {
      if (ph.__loaded) return
      ph.init(id, {
        api_host: host,
        flags_api_host: flags_api_host,
        person_profiles: 'always',
      })
    })
  }, [id, host, flags_api_host, isDisabled])

  useEffect(() => {
    if (!user) return
    startAnalyticsSession(user)
  }, [user])

  // From PostHog tutorial on PageView tracking in a Single Page Application (SPA) context.
  useEffect(() => {
    getPosthog().then((ph) => {
      ph.capture('$pageview')
    })
  }, [location])

  return null
}

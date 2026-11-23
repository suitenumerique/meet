import { useEffect } from 'react'
import { type ApiUser } from '@/features/auth/api/ApiUser'
import { useUser } from '@/features/auth/api/useUser'
import { getPosthog } from '../utils'
import { filterExceptions } from '../exceptionFilters'

export const startAnalyticsSession = (data: ApiUser) => {
  getPosthog()
    .then((ph) => {
      if (!ph || ph._isIdentified()) return
      const { id, email } = data
      ph.identify(id, { email })
    })
    .catch(() => {})
}

export const terminateAnalyticsSession = async () => {
  const ph = await getPosthog().catch(() => null)
  if (!ph?._isIdentified()) return
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
  const { user } = useUser()
  const isEnabled = !!id && !!host && !isDisabled

  useEffect(() => {
    if (!isEnabled) return
    getPosthog()
      .then((ph) => {
        if (!ph || ph.__loaded) return
        ph.init(id, {
          api_host: host,
          flags_api_host: flags_api_host,
          person_profiles: 'always',
          remote_config_refresh_interval_ms: 0,
          capture_pageview: 'history_change',
          capture_pageleave: true,
          capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: true,
          },
          disable_surveys: true,
          before_send: filterExceptions,
        })
      })
      .catch(() => {})
  }, [isEnabled, id, host, flags_api_host])

  useEffect(() => {
    if (!isEnabled || !user) return
    startAnalyticsSession(user)
  }, [isEnabled, user])

  return null
}

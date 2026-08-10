import { useEffect } from 'react'
import { type ApiUser } from '@/features/auth/api/ApiUser'
import { useUser } from '@/features/auth/api/useUser'
import { getPosthog } from '../utils'

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
  const { user } = useUser()

  useEffect(() => {
    if (!id || !host || isDisabled) return
    getPosthog().then((ph) => {
      if (ph.__loaded) return
      ph.init(id, {
        api_host: host,
        flags_api_host: flags_api_host,
        person_profiles: 'always',
        capture_pageview: 'history_change',
        capture_pageleave: true,
        capture_exceptions: {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
          capture_console_errors: true,
        },
      })
    })
  }, [id, host, flags_api_host, isDisabled])

  useEffect(() => {
    if (!user) return
    startAnalyticsSession(user)
  }, [user])

  return null
}

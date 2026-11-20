import { useEffect, useState } from 'react'
import { getPosthog, peekPosthog } from '../utils'
import { useIsAnalyticsEnabled } from './useIsAnalyticsEnabled'

/**
 * Same contract as `useFeatureFlagEnabled` from 'posthog-js/react', without a
 * static import of posthog-js: that import puts the whole SDK on the critical
 * path of every screen, defeating the lazy `getPosthog()`.
 */
export const useFeatureFlagEnabled = (flag: string): boolean | undefined => {
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const [enabled, setEnabled] = useState<boolean | undefined>(() =>
    isAnalyticsEnabled ? peekPosthog()?.isFeatureEnabled(flag) : undefined
  )

  useEffect(() => {
    if (!isAnalyticsEnabled) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    void getPosthog().then((ph) => {
      if (cancelled || !ph) return
      setEnabled(ph.isFeatureEnabled(flag))
      unsubscribe = ph.onFeatureFlags(() =>
        setEnabled(ph.isFeatureEnabled(flag))
      )
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [flag, isAnalyticsEnabled])

  return enabled
}

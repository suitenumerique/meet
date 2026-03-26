import { silenceLiveKitLogs } from '@/utils/livekit'
import { useConfig } from '@/api/useConfig'
import { useAnalytics } from '@/features/analytics/hooks/useAnalytics'
import { useSupport } from '@/features/support/hooks/useSupport'
import { useSyncUserPreferencesWithBackend } from '@/features/auth'
import { useEffect } from 'react'
import { CozyBridge } from 'cozy-external-bridge'

// Twake override
const TARGET_ORIGIN_ALLOWLIST = import.meta.env.VITE_BRIDGE_TARGET_ORIGIN_ALLOWLIST

const checkParentOrigin = (parentOrigin: string) => {
  const targetOriginAllowlist = TARGET_ORIGIN_ALLOWLIST ? TARGET_ORIGIN_ALLOWLIST.split(',') : []

  if (targetOriginAllowlist.some((allowedOrigin: string) => parentOrigin.endsWith(allowedOrigin))) {
    return true
  }
  return false
}

export const AppInitialization = () => {
  const { data } = useConfig()
  useSyncUserPreferencesWithBackend()

  const {
    analytics = {},
    support = {},
    silence_livekit_debug_logs = false,
    custom_css_url = '',
  } = data ?? {}

  useAnalytics(analytics)
  useSupport(support)

  // Twake override
  useEffect(() => {
    const setupBridge = async () => {
      const bridge = new CozyBridge()
      if (bridge.isInIframe()) {
        const parentOrigin = await bridge.requestParentOrigin()
      
        if(parentOrigin && checkParentOrigin(parentOrigin)) {
          bridge.setupBridge(parentOrigin)
          bridge.startHistorySyncing()

          window.twake = {
            twakeOrigin: parentOrigin + "/#/bridge"
          }
        } 
      }
    }

    setupBridge()
  }, [])

  useEffect(() => {
    if (custom_css_url) {
      const link = document.createElement('link')
      link.href = custom_css_url
      link.id = 'meet-custom-css'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
  }, [custom_css_url])

  silenceLiveKitLogs(silence_livekit_debug_logs)

  return null
}

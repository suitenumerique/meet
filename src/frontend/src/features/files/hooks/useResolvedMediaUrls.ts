import { useCallback, useEffect, useState } from 'react'
import { useSnapshot } from 'valtio'
import { accessTokenStore } from '@/stores/accessToken'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

/**
 * Reactive companion of resolveMediaUrl for browser-native consumers
 * (CSS url(), img src attributes): resolves a list of /media/ URLs and
 * returns a stable lookup, identity in regular mode.
 *
 * Object URLs come from the shared session-lifetime cache and are never
 * revoked here: they may be used concurrently by the background
 * processors.
 */
export const useResolvedMediaUrls = (
  urls: (string | null | undefined)[]
): ((url: string) => string) => {
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const { accessToken } = useSnapshot(accessTokenStore)

  // Stable dependency for the effect, insensitive to array identity
  const urlsKey = urls.filter(Boolean).sort().join('\n')

  useEffect(() => {
    if (!accessToken || !urlsKey) {
      return
    }

    let isMounted = true

    const resolveAll = async () => {
      const entries = await Promise.all(
        urlsKey.split('\n').map(async (url) => {
          try {
            return [url, await resolveMediaUrl(url)] as const
          } catch (error) {
            console.warn(error)
            return [url, url] as const
          }
        })
      )
      if (isMounted) {
        setResolved(Object.fromEntries(entries))
      }
    }
    resolveAll()

    return () => {
      isMounted = false
    }
  }, [accessToken, urlsKey])

  // Stable identity so that consumers can safely list the resolver in
  // their memo dependencies: it only changes when resolutions land.
  return useCallback((url: string) => resolved[url] ?? url, [resolved])
}

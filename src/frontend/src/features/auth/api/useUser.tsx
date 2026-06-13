import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { fetchUser } from './fetchUser'
import { type ApiUser } from './ApiUser'
import { useMemo } from 'react'
import { useConfig } from '@/api/useConfig'

const SILENT_LOGIN_PARAM = 'silentLogin'

const isSilentLoginDisabledByUrl = () => {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get(
    SILENT_LOGIN_PARAM
  )
  return value === 'false'
}

/**
 * returns info about currently logged-in user
 *
 * `isLoggedIn` is undefined while query is loading and true/false when it's done
 */
export const useUser = (
  opts: {
    fetchUserOptions?: Parameters<typeof fetchUser>[0]
  } = {}
) => {
  const { data, isLoading: isConfigLoading } = useConfig()

  const disabledByUrl = useMemo(() => isSilentLoginDisabledByUrl(), [])

  const options = useMemo(() => {
    if (isConfigLoading) return

    const silentDisabled =
      data?.is_silent_login_enabled !== true || disabledByUrl

    if (silentDisabled) {
      return {
        ...opts.fetchUserOptions,
        attemptSilent: false,
      }
    }
    return opts.fetchUserOptions
  }, [data, opts, isConfigLoading, disabledByUrl])

  const query = useQuery({
    queryKey: [keys.user],
    queryFn: () => fetchUser(options),
    staleTime: Infinity,
    enabled: !isConfigLoading,
  })

  const isLoggedIn =
    query.status === 'success' ? query.data !== false : undefined
  const isLoggedOut = isLoggedIn === false

  return {
    refetch: query.refetch,
    user: isLoggedOut ? undefined : (query.data as ApiUser | undefined),
    isLoggedIn,
    isLoading: query.isLoading,
  }
}

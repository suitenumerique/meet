import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { fetchUser } from './fetchUser'
import { type ApiUser } from './ApiUser'
import { useEffect } from 'react'
import { startAnalyticsSession } from '@/features/analytics/hooks/useAnalytics'
import { initializeSupportSession } from '@/features/support/hooks/useSupport'

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
  const query = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [keys.user],
    queryFn: () => fetchUser(opts.fetchUserOptions),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (query?.data) {
      startAnalyticsSession(query.data)
      initializeSupportSession(query.data)
    }
  }, [query.data])

  const isLoggedIn =
    query.status === 'success' ? query.data !== false : undefined
  const isLoggedOut = isLoggedIn === false

  return {
    ...query,
    user: isLoggedOut ? undefined : (query.data as ApiUser | undefined),
    isLoggedIn,
  }
}

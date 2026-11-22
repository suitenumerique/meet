import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { fetchUser } from './fetchUser'
import { type ApiUser } from './ApiUser'

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
    queryKey: [keys.user],
    queryFn: () => fetchUser(opts.fetchUserOptions),
    staleTime: Infinity,
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

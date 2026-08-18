import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { fetchParticipantsCount } from '../api/fetchParticipantsCount'

export const POLL_INTERVAL_MS = 5000

/**
 * How many people are in the meeting, refreshed while the join screen is open.
 *
 * The answer is `undefined` until it arrives, and stays `undefined` for a room
 * the API will not report on, which is every room the caller cannot enter
 * without approval.
 */
export const useParticipantsCount = (roomId: string) => {
  const { data } = useQuery({
    queryKey: [keys.participantsCount, roomId],
    queryFn: () => fetchParticipantsCount({ roomId }),
    // A room that refuses once refuses for as long as this screen is open, so
    // the poll stops rather than asking every five seconds for nothing.
    refetchInterval: (query) => (query.state.error ? false : POLL_INTERVAL_MS),
    retry: false,
  })

  return data?.count
}

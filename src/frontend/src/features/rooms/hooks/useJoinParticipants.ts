import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { ApiError } from '@/api/ApiError'
import { fetchParticipants } from '../api/fetchParticipants'

export const POLL_INTERVAL_MS = 5000

/**
 * Who is in the meeting, refreshed while the join screen is open. Named apart
 * from livekit's own useParticipants, which answers the same question from
 * inside the meeting.
 *
 * The answer is `undefined` until it arrives, and stays `undefined` for a room
 * the API will not report on, which is every room the caller cannot enter
 * without approval.
 */
export const useJoinParticipants = (roomId: string) => {
  const { data } = useQuery({
    queryKey: [keys.participants, roomId],
    queryFn: () => fetchParticipants({ roomId }),
    refetchInterval: (query) => {
      const error = query.state.error
      // A room that will not report never starts, so asking again is waste. A
      // media server that cannot be reached does come back, and the API holds
      // its own failure, so asking again costs it nothing.
      const refused = error instanceof ApiError && error.statusCode < 500
      return refused ? false : POLL_INTERVAL_MS
    },
    // Coming back to the tab is worth a refresh, and without this every one of
    // them fires a fetch on top of the interval.
    staleTime: POLL_INTERVAL_MS,
    retry: false,
  })

  return data
}

import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { ApiError } from '@/api/ApiError'
import { fetchParticipants } from '../api/fetchParticipants'

export const POLL_INTERVAL_MS = 5000

// Past this many, the roster stops being a sentence and becomes a wall. The
// endpoint answers with everyone unless asked for fewer.
const MAX_NAMES = 5

/**
 * Who is in the meeting, refreshed while the join screen is open. Named apart
 * from livekit's own useParticipants, which answers the same question from
 * inside the meeting.
 *
 * Returns undefined while the first answer is in flight, and for a room the
 * caller may not enter, where the API answers 404.
 */
export const useJoinParticipants = (roomId: string) => {
  const { data } = useQuery({
    queryKey: [keys.participants, roomId],
    queryFn: () => fetchParticipants({ roomId, names: MAX_NAMES }),
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

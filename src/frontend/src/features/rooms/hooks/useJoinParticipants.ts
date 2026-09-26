import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { ApiError } from '@/api/ApiError'
import { fetchParticipants } from '../api/fetchParticipants'

const POLL_INTERVAL_MS = 15_000

// A refusal will not change, so it stops the poll. A media server that cannot
// be reached does come back, and the API holds its own failure.
const isRefusal = (error: unknown) =>
  error instanceof ApiError && error.statusCode < 500

/**
 * Who is in the meeting, refreshed while the join screen is open. Named apart
 * from livekit's own useParticipants, which answers the same question from
 * inside the meeting.
 *
 * Returns undefined while the first answer is in flight, and once the API
 * refuses, so a roster it answered earlier is not left on screen as current.
 */
export const useJoinParticipants = (roomId: string) => {
  const { data, error } = useQuery({
    queryKey: [keys.participants, roomId],
    queryFn: () => fetchParticipants(roomId),
    refetchInterval: (query) =>
      isRefusal(query.state.error) ? false : POLL_INTERVAL_MS,
    // Coming back to the tab is worth a refresh, and without this every one of
    // them fires a fetch on top of the interval.
    staleTime: POLL_INTERVAL_MS,
    retry: false,
  })

  return isRefusal(error) ? undefined : data
}

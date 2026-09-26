import { fetchApi } from '@/api/fetchApi'

// Past the server's limit, count is null and names is empty: the meeting has
// started, and that is all the join screen is told.
export type ApiParticipants = {
  count: number | null
  names: string[]
}

export const fetchParticipants = (roomId: string) =>
  fetchApi<ApiParticipants>(`/rooms/${roomId}/participants/`)

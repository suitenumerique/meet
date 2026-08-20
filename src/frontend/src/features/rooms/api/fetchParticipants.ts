import { fetchApi } from '@/api/fetchApi'

export type ApiParticipants = {
  count: number
  names: string[]
}

export const fetchParticipants = ({ roomId }: { roomId: string }) =>
  fetchApi<ApiParticipants>(`/rooms/${roomId}/participants/`)

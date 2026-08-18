import { fetchApi } from '@/api/fetchApi'

export type ApiParticipantsCount = {
  count: number
}

export const fetchParticipantsCount = ({ roomId }: { roomId: string }) =>
  fetchApi<ApiParticipantsCount>(`/rooms/${roomId}/participants-count/`)

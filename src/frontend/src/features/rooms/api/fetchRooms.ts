import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'

export type ApiRoomListResponse = {
  count: number
  next: string | null
  previous: string | null
  results: ApiRoom[]
}

export const fetchRooms = ({
  role,
}: {
  role?: 'owner' | 'administrator' | 'member'
} = {}): Promise<ApiRoomListResponse> => {
  const query = role ? `?role=${role}` : ''
  return fetchApi<ApiRoomListResponse>(`/rooms/${query}`)
}

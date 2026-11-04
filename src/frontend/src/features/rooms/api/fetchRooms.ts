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
  pageSize,
}: {
  role?: 'owner' | 'administrator' | 'member'
  pageSize?: number
} = {}): Promise<ApiRoomListResponse> => {
  const params = new URLSearchParams()
  if (role) params.set('role', role)
  if (pageSize) params.set('page_size', String(pageSize))
  const query = params.toString() ? `?${params.toString()}` : ''
  return fetchApi<ApiRoomListResponse>(`/rooms/${query}`)
}

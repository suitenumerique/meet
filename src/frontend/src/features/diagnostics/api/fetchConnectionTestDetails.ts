import { fetchApi } from '@/api/fetchApi'

export type LiveKitConnectionDetails = {
  url: string
  room: string
  token: string
  expires_in: number
}

export type ConnectionTestResponse = {
  livekit: LiveKitConnectionDetails
}

export const fetchConnectionTestDetails = () =>
  fetchApi<ConnectionTestResponse>('/diagnostics/connection/', {
    method: 'POST',
  })

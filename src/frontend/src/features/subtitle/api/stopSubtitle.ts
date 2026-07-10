import { fetchApi } from '@/api/fetchApi'

export interface StopSubtitleParams {
  id: string
  token: string
}

export const stopSubtitle = ({
  id,
  token,
}: StopSubtitleParams): Promise<{ status: string }> => {
  return fetchApi(`rooms/${id}/stop-subtitle/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

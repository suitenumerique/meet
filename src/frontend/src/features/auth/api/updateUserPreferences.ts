import { type ApiUser } from './ApiUser'
import { fetchApi } from '@/api/fetchApi'

export type ApiUserPreferences = Pick<ApiUser, 'id' | 'timezone' | 'language'>

export const updateUserPreferences = async ({
  user,
}: {
  user: ApiUserPreferences
}): Promise<ApiUser> => {
  return await fetchApi(`/users/${user.id}/`, {
    method: 'PUT',
    body: JSON.stringify({ timezone: user.timezone, language: user.language }),
  })
}

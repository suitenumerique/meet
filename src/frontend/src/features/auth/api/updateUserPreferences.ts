import { type ApiUser } from './ApiUser'
import { fetchApi } from '@/api/fetchApi'

export type ApiUserPreferences = Partial<
  Pick<ApiUser, 'timezone' | 'language' | 'default_encryption'>
> & { id: string }

export const updateUserPreferences = async ({
  user,
}: {
  user: ApiUserPreferences
}): Promise<ApiUser> => {
  const { id, ...payload } = user
  return await fetchApi(`/users/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

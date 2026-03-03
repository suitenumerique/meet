import { ApiError } from './ApiError'
import { apiUrl } from './apiUrl'

export const fetchApi = async <T = Record<string, unknown>>(
  url: string,
  options?: RequestInit,
  transformResponse: (response: Response) => Promise<T> = async (response) =>
    await response.json()
): Promise<T> => {
  const csrfToken = getCsrfToken()
  const response = await fetch(apiUrl(url), {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(!!csrfToken && { 'X-CSRFToken': csrfToken }),
      ...options?.headers,
    },
  })
  const result = await transformResponse(response)

  if (!response.ok) {
    throw new ApiError(response.status, result)
  }
  return result
}

const getCsrfToken = () => {
  return document.cookie
    .split(';')
    .filter((cookie) => cookie.trim().startsWith('csrftoken='))
    .map((cookie) => cookie.split('=')[1])
    .pop()
}

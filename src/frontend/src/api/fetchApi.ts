import { ApiError } from './ApiError'
import { apiUrl } from './apiUrl'
import { getAccessToken } from '@/stores/accessToken'

export const fetchApi = async <T = Record<string, unknown>>(
  url: string,
  options?: RequestInit
): Promise<T> => {
  const csrfToken = getCsrfToken()
  // Embedded (iframe) mode: the user access token obtained through the
  // transit code exchange authenticates requests in place of the session
  // cookie, which is blocked in third-party contexts.
  const accessToken = getAccessToken()
  const response = await fetch(apiUrl(url), {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(!!csrfToken && { 'X-CSRFToken': csrfToken }),
      ...(!!accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...options?.headers,
    },
  })

  let result: T
  if (response.status === 204) {
    result = undefined as T
  } else {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      result = undefined as T
    } else {
      result = (await response.json()) as T
    }
  }

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

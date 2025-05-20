import { ApiError } from './ApiError'
import { apiUrl } from './apiUrl'

export const fetchApi = async <T = Record<string, unknown>>(
  url: string,
  options?: RequestInit
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

  // Handle empty responses (like for DELETE requests)
  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return {} as T
  }

  const result = await response.json()
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

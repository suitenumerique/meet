import { ApiError } from '@/api/ApiError'
import { fetchApi } from '@/api/fetchApi'
import { queryClient } from '@/api/queryClient'
import { configQueryOptions } from '@/api/useConfig'
import { type ApiUser } from './ApiUser'
import { attemptSilentLogin, canAttemptSilentLogin } from '../utils/silentLogin'
import { getAccessToken } from '@/stores/accessToken'

const SILENT_LOGIN_PARAM = 'silentLogin'

const isSilentLoginDisabledByUrl = () => {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get(
    SILENT_LOGIN_PARAM
  )
  return value === 'false'
}

/**
 * The config is only needed once the api answered 401, so it must not delay
 * the user request itself: both are fetched in parallel, and the config is
 * awaited here, from the query cache it shares with useConfig.
 */
const isSilentLoginEnabled = async () => {
  if (isSilentLoginDisabledByUrl()) return false
  try {
    const config = await queryClient.ensureQueryData(configQueryOptions)
    return config.is_silent_login_enabled === true
  } catch {
    return false
  }
}

/**
 * fetch the logged-in user from the api.
 *
 * If the user is not logged in, the api returns a 401 error.
 * Here our wrapper just returns false in that case, without triggering an error:
 * this is done to prevent unnecessary query retries with react query
 */
export const fetchUser = (
  opts: {
    attemptSilent?: boolean
  } = {
    attemptSilent: true,
  }
): Promise<ApiUser | false> => {
  return new Promise((resolve, reject) => {
    fetchApi<ApiUser>('/users/me/')
      .then(resolve)
      .catch(async (error) => {
        // we assume that a 401 means the user is not logged in
        if (error instanceof ApiError && error.statusCode === 401) {
          // make sure to not resolve the promise while trying to silent login
          // so that consumers of fetchUser don't think the work already ended
          // Never attempt a silent login in embedded (token) mode: an OIDC
          // redirect inside the iframe would break the embed.
          if (
            opts.attemptSilent &&
            !getAccessToken() &&
            canAttemptSilentLogin() &&
            (await isSilentLoginEnabled())
          ) {
            attemptSilentLogin(30)
          } else {
            resolve(false)
          }
        } else {
          reject(error)
        }
      })
  })
}

import { fetchApi } from '@/api/fetchApi'
import { setAccessToken } from '@/stores/accessToken'
import { consumeTransitCodeFromFragment } from '../utils/transitCode'

type ApiAccessToken = {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

/**
 * Exchange a single-use transit code for a user access token.
 *
 * The endpoint is unauthenticated: the code itself is the credential.
 */
export const exchangeAccessToken = (code: string): Promise<ApiAccessToken> => {
  return fetchApi<ApiAccessToken>('/users/exchange-access-token/', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

const runInitialization = async (): Promise<void> => {
  const code = consumeTransitCodeFromFragment()

  if (!code) {
    return
  }

  try {
    const { access_token } = await exchangeAccessToken(code)
    setAccessToken(access_token)
  } catch (error) {
    console.warn('Transit code exchange failed:', error)
  }
}

let initialization: Promise<void> | null = null

/**
 * Bootstrap the embedded (iframe) authentication, if applicable.
 *
 * When, and only when, a transit code is present in the URL fragment,
 * exchange it for a user access token and keep it in the in-memory
 * accessToken store: fetchApi then sends it as a Bearer header on every
 * api call, authenticating the user exactly like a session cookie would.
 *
 * Must complete before anything fires an authenticated query, which the
 * TransitCodeGate component guarantees by gating the app tree on it.
 *
 * Memoized: the fragment is consumed and the code exchanged exactly once,
 * however many times this is called (StrictMode double-invoked effects,
 * among others). Subsequent calls await the same promise.
 *
 * A failed exchange (expired or already used code) is not fatal: the app
 * starts unauthenticated, falling back to the regular session flow.
 */
export const initializeAccessTokenFromFragment = (): Promise<void> => {
  if (!initialization) {
    initialization = runInitialization()
  }
  return initialization
}

import { proxy } from 'valtio'

type State = {
  accessToken: string | null
}

/**
 * User access token for the embedded (iframe) mode.
 *
 * When Meet is rendered inside an iframe, third-party session cookies are
 * blocked: the host application passes a single-use transit code in the
 * URL fragment, exchanged at startup for a user access token (see
 * features/auth/api/exchangeAccessToken) that authenticates every api
 * call exactly like a session cookie would.
 *
 * The token deliberately lives in this in-memory store only: unlike other
 * stores, it is never persisted (no subscribe/localStorage) and never
 * appears in a URL. It is lost on reload, in which case the host page is
 * expected to mint a fresh transit code.
 *
 * A non-null token also tells the app it is running in embedded mode:
 * components can react to it with useSnapshot(accessTokenStore).
 */
export const accessTokenStore = proxy<State>({
  accessToken: null,
})

export const setAccessToken = (accessToken: string | null) => {
  accessTokenStore.accessToken = accessToken
}

export const getAccessToken = () => accessTokenStore.accessToken

import { authUrl, useUser } from '../auth'

export enum ClientMessageType {
  ROOM_CREATED = 'ROOM_CREATED',
}

export class SdkReverseClient {
  /**
   * IDEA: Use API Key. Must be based on some sort of credentials? No needs for now as there are no security
   * plausible at the moment.
   */
  static getAllowTargetOrigin() {
    return '*'
  }

  static post(type: ClientMessageType, data: unknown = {}) {
    window.parent.postMessage(
      {
        type,
        data,
      },
      SdkReverseClient.getAllowTargetOrigin()
    )
  }

  static broadcastAuthentication() {
    const bc = new BroadcastChannel('APP_CHANNEL')
    bc.postMessage({ type: 'AUTHENTICATED' })

    /**
     * This means the parent window has authenticated has successfully refetched user, then we can close the popup.
     */
    bc.onmessage = (event) => {
      if (event.data.type === 'AUTHENTICATED_ACK') {
        window.close()
      }
    }
  }

  static waitForAuthenticationAck() {
    return new Promise<void>((resolve) => {
      const bc = new BroadcastChannel('APP_CHANNEL')
      bc.onmessage = async (event) => {
        if (event.data.type === 'AUTHENTICATED') {
          resolve()
          bc.postMessage({ type: 'AUTHENTICATED_ACK' })
        }
      }
    })
  }
}

/**
 * Returns a function to be awaited in order to make sure the user is logged in.
 * If not logged-in it opens a popup with the connection flow, the promise returned is resolved
 * once logged-in.
 *
 * To be used in SDK scope.
 */
export function useEnsureAuth() {
  const { isLoggedIn, ...other } = useUser({
    fetchUserOptions: { attemptSilent: false },
  })

  const startSSO = () => {
    return new Promise<void>((resolve) => {
      SdkReverseClient.waitForAuthenticationAck().then(async () => {
        await other.refetch()
        resolve()
      })
      const params = `scrollbars=no,resizable=no,status=no,location=no,toolbar=no,menubar=no,
  width=400,height=900,left=100,top=100`
      window.open(new URL('authenticate/', authUrl()).href, '', params)
    })
  }

  const ensureAuth = async () => {
    if (!isLoggedIn) {
      await startSSO()
    }
  }

  return { ensureAuth }
}

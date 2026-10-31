const LIVEKIT_AUTH_SCHEME = 'X-LiveKit-Token'

export const getLiveKitAuthHeaders = (token: string) => {
  return {
    Authorization: `${LIVEKIT_AUTH_SCHEME} ${token}`,
  }
}

import { getAccessToken } from '@/stores/accessToken'

// Session-lifetime cache: object URLs are shared between every consumer
// of a given media (background processors, thumbnails) and are therefore
// never revoked - their number is bounded by the user's custom
// backgrounds, and they die with the page like the access token does.
const objectUrlCache = new Map<string, string>()

/**
 * Resolve an authenticated /media/ URL for the embedded (token) mode.
 *
 * Media files are served behind an nginx auth_request subrequest that
 * authenticates the original request. In regular mode the session cookie
 * rides along browser-native loads (img.src, CSS url()) and the URL is
 * returned unchanged, without any fetch. In embedded mode the
 * third-party cookie is blocked and native loads cannot carry the
 * Authorization header, so the media is fetched here with the Bearer
 * header - which the media-auth endpoint accepts, as it sits behind the
 * default authentication stack - and exposed as a blob object URL.
 */
export const resolveMediaUrl = async (url: string): Promise<string> => {
  const accessToken = getAccessToken()

  if (!accessToken) {
    return url
  }

  const cached = objectUrlCache.get(url)
  if (cached) {
    return cached
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to resolve media url ${url}: HTTP ${response.status}`
    )
  }

  const objectUrl = URL.createObjectURL(await response.blob())
  objectUrlCache.set(url, objectUrl)

  return objectUrl
}

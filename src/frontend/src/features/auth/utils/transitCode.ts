const TRANSIT_CODE_FRAGMENT_PARAM = 'transit_code'

/**
 * Whether a URL fragment carries a transit code. Pure check, does not
 * consume anything.
 */
export const hasTransitCodeInFragment = (hash: string): boolean => {
  if (!hash) {
    return false
  }
  return new URLSearchParams(hash.replace(/^#/, '')).has(
    TRANSIT_CODE_FRAGMENT_PARAM
  )
}

/**
 * Extract the transit code from the URL fragment, if any.
 *
 * The fragment is scrubbed from the address bar immediately, before any
 * network call, so the code never lingers in the browser history. Any
 * other fragment content is preserved.
 */
export const consumeTransitCodeFromFragment = (): string | null => {
  if (typeof window === 'undefined' || !window.location.hash) {
    return null
  }

  const params = new URLSearchParams(window.location.hash.substring(1))
  const code = params.get(TRANSIT_CODE_FRAGMENT_PARAM)

  if (!code) {
    return null
  }

  params.delete(TRANSIT_CODE_FRAGMENT_PARAM)
  const remaining = params.toString()
  window.history.replaceState(
    null,
    '',
    window.location.pathname +
      window.location.search +
      (remaining ? `#${remaining}` : '')
  )

  return code
}

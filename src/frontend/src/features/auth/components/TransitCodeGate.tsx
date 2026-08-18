import { useEffect, useState } from 'react'
import { LoadingScreen } from '@/components/LoadingScreen'
import { useHash } from '@/hooks/useHash'
import { initializeAccessTokenFromFragment } from '../api/exchangeAccessToken'
import { hasTransitCodeInFragment } from '../utils/transitCode'

/**
 * Gates the app tree on the embedded (iframe) authentication bootstrap.
 *
 * Without a transit code in the URL fragment — the overwhelmingly common
 * case — the component early returns children synchronously: no state,
 * no effect, no extra render, no loading screen.
 *
 * When a transit code is present, children are not mounted until it has
 * been exchanged for a user access token, so that every authenticated
 * query already carries the Authorization header. A loading screen is
 * displayed in the meantime, as UserAware does.
 */
export const TransitCodeGate = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const hash = useHash()

  // Note: the exchange only happens in an embedding context. This check lives
  // in initializeAccessTokenFromFragment, the single funnel for all bootstrap paths.
  // The gate still mounts top-level to scrub the fragment, but bootstrap then resolves
  // immediately without exchanging.
  //
  // Latch the decision on the initial hash: bootstrap scrubs it immediately, and the
  // gate must not switch back to the fast path while the exchange is in flight.
  const [needsExchange] = useState(() => hasTransitCodeInFragment(hash))

  if (!needsExchange) {
    return children
  }

  return <TransitCodeExchange>{children}</TransitCodeExchange>
}

/**
 * Only ever mounted when a transit code is present: runs the memoized
 * bootstrap (safe against StrictMode double-invoked effects) and holds
 * children back until it settles.
 */
const TransitCodeExchange = ({ children }: { children: React.ReactNode }) => {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let isMounted = true
    initializeAccessTokenFromFragment().finally(() => {
      if (isMounted) {
        setIsReady(true)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  return isReady ? (
    children
  ) : (
    <LoadingScreen header={false} footer={false} delay={1000} />
  )
}

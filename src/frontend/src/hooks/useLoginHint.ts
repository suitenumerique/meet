import { useSnapshot } from 'valtio'
import { hintsStore } from '@/stores/hints'
import { useUser } from '@/features/auth'
import { useEffect } from 'react'

export const useLoginHint = () => {
  const hintsSnap = useSnapshot(hintsStore)
  const { isLoggedIn } = useUser()

  const openLoginHint = () => (hintsStore.showLoginHint = true)
  const closeLoginHint = () => (hintsStore.showLoginHint = false)

  useEffect(() => {
    if (isLoggedIn && hintsSnap.showLoginHint) closeLoginHint()
  }, [isLoggedIn, hintsSnap])

  return {
    isVisible: hintsSnap.showLoginHint,
    openLoginHint,
    closeLoginHint,
  }
}

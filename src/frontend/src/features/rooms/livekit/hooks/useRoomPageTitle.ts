import { useTitle } from 'hoofd'
import { useMemo } from 'react'

const APP_TITLE = import.meta.env.VITE_APP_TITLE ?? ''

/**
 * Updates the browser tab title with the room id to help users easily find
 * the meeting tab among many open tabs. Works on both the join screen and
 * once connected.
 */
export const useRoomPageTitle = (roomId?: string) => {
  const pageTitle = useMemo(() => {
    if (!roomId) return APP_TITLE
    return `${APP_TITLE} - ${roomId}`
  }, [roomId])

  useTitle(pageTitle)
}

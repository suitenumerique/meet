import { useTitle } from 'hoofd'
import { useRoomData } from './useRoomData'
import { useMemo } from 'react'

const APP_TITLE = import.meta.env.VITE_APP_TITLE ?? ''

/**
 * Updates the browser tab title with the room name to help users easily find
 * the meeting tab among many open tabs. Works on both the join screen and
 * once connected.
 */
export const useRoomPageTitle = () => {
  const roomData = useRoomData()

  const pageTitle = useMemo(() => {
    if (!roomData) {
      return APP_TITLE
    }

    const roomLabel = roomData.name || roomData.slug || ''

    if (!roomLabel) return APP_TITLE

    return `${APP_TITLE} - ${roomLabel}  `
  }, [roomData])

  useTitle(pageTitle)
}

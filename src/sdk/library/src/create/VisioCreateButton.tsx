import { useEffect } from 'react'
import { ClientMessageType, RoomData } from '@/Types'
import { DEFAULT_CONFIG } from '@/Config'

export const VisioCreateButton = ({
  onRoomCreated,
  onClear,
  readOnly = false,
  slug,
  code,
}: {
  onRoomCreated: (roomData: RoomData) => void
  onClear: () => void
  readOnly?: boolean
  // An existing room to show again, as received with `onRoomCreated`
  slug?: string
  code?: string
}) => {
  const params = new URLSearchParams({ readOnly: String(readOnly) })
  if (slug) {
    params.set('slug', slug)
    if (code) params.set('code', code)
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Make sure it is the correct origin.
      if (event.origin !== new URL(DEFAULT_CONFIG.url).origin) {
        return
      }
      const { type, data } = event.data
      if (type == ClientMessageType.ROOM_CREATED && data?.room) {
        onRoomCreated(data.room)
      } else if (type == ClientMessageType.STATE_CLEAR) {
        onClear()
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [onRoomCreated, onClear])

  return (
    // eslint-disable-next-line jsx-a11y/iframe-has-title
    <iframe
      allow="clipboard-read; clipboard-write"
      src={`${DEFAULT_CONFIG.url}/create-button?${params}`}
      style={{
        width: '100%',
        height: '150px',
        border: 'none',
      }}
    ></iframe>
  )
}

import { useEffect } from 'react'
import { ClientMessageType, RoomData } from '@/Types'
import { DEFAULT_CONFIG } from '@/Config'

export const VisioCreateButton = ({
  onRoomCreated,
  readOnly = false,
  slug,
}: {
  onRoomCreated: (roomData: RoomData) => void
  readOnly?: boolean
  slug?: string
}) => {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Make sure it is the correct origin.
      if (event.origin !== new URL(DEFAULT_CONFIG.url).origin) {
        return
      }
      const { type, data } = event.data
      if (type == ClientMessageType.ROOM_CREATED && data?.room) {
        onRoomCreated(data.room)
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [onRoomCreated])

  return (
    // eslint-disable-next-line jsx-a11y/iframe-has-title
    <iframe
      allow="clipboard-read; clipboard-write"
      src={
        DEFAULT_CONFIG.url +
        `/create-button?readOnly=${readOnly}${slug ? '&slug=' + slug : ''}`
      }
      style={{
        width: '100%',
        height: '100px',
        border: 'none',
      }}
    ></iframe>
  )
}

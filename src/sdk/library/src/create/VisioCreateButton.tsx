import { DEFAULT_CONFIG } from '@/Config'
import { ClientMessageType } from '@/Types'
import { useEffect } from 'react'

export const VisioCreateButton = ({
  onRoomCreated,
}: {
  onRoomCreated: (roomUrl: string) => void
}) => {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Make sure it is the correct origin.
      if (event.origin !== new URL(DEFAULT_CONFIG.url).origin) {
        return
      }
      if (event.data.type === ClientMessageType.ROOM_CREATED) {
        const data = event.data.data
        const roomUrl = data.url
        onRoomCreated(roomUrl)
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
      src={DEFAULT_CONFIG.url + '/create-button'}
      style={{
        width: '100%',
        height: '52px',
        border: 'none',
      }}
    ></iframe>
  )
}

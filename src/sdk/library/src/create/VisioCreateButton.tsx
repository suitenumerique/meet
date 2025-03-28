import { DEFAULT_CONFIG } from '@/Config'
import { ClientMessageType } from '@/Types'
import { useEffect, useState } from 'react'

import React from 'react'
import { VisioIcon } from '@/assets/VisioIcon'
import { CopyLineIcon } from '@/assets/CopyLineIcon'
import { CheckIcon } from '@/assets/CheckIcon'

type RoomData = {
  source: string
  slug: string
  url: string
  phone?: string
  code?: string
}

export const VisioCreateButton = ({
  onRoomCreated,
  createButtonLabel = 'Créer une réunion',
  joinButtonLabel = 'Participer avec Visio',
  condensed = false,
}: {
  onRoomCreated: (roomData: RoomData) => void
  createButtonLabel?: string
  condensed?: boolean
}) => {
  const [roomMetadata, setRoomMetadata] = useState<RoomData>(undefined)
  const [popupWindow, setPopupWindow] = useState(undefined)

  // Set up listener for messages from popup
  useEffect(() => {
    const handleMessage = (event) => {
      // For security, verify the origin of the message
      // Replace 'https://your-popup-domain.com' with your actual popup domain
      // Use '*' only for development/testing, never in production
      // const trustedOrigins = [
      //   'https://meet.127.0.0.1.nip.io/sdk/create-button',
      //   window.location.origin,
      // ]

      const roomData: RoomData = event.data

      console.log('Message received from popup:', event.origin, event.data)

      if (event.data.source != 'https://meet.127.0.0.1.nip.io/') return

      setRoomMetadata(roomData)
      onRoomCreated(roomData)

      // if (trustedOrigins.includes(event.origin)) {
      //   console.log('Message received from popup:', event.data)
      //   setMessageFromPopup(event.data)
      // } else {
      //   console.warn('Received message from untrusted origin:', event.origin)
      // }
    }

    // Add event listener
    window.addEventListener('message', handleMessage)

    // Clean up
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // Function to open popup
  const openPopup = () => {
    const openerWindow = window
    const openerWidth =
      openerWindow.innerWidth ||
      openerWindow.document.documentElement.clientWidth ||
      openerWindow.document.body.clientWidth
    const openerHeight =
      openerWindow.innerHeight ||
      openerWindow.document.documentElement.clientHeight ||
      openerWindow.document.body.clientHeight

    // Get the opener window's position
    const openerLeft = openerWindow.screenX || openerWindow.screenLeft
    const openerTop = openerWindow.screenY || openerWindow.screenTop

    // Define popup dimensions
    const popupWidth = 500
    const popupHeight = 500

    // Calculate position centered relative to the opener window
    const left = openerLeft + (openerWidth - popupWidth) / 2
    const top = openerTop + (openerHeight - popupHeight) / 2

    const popup = window.open(
      `https://meet.127.0.0.1.nip.io/sdk/create-button?width=${popupWidth}&height=${popupHeight}&left=${left}&top=${top}`, // Path to your popup HTML page
      'popupWindow',
      `width=${popupWidth},height=${popupHeight}, left=${left}, top=${top}, resizable=yes,scrollbars=yes`
    )

    if (popup) {
      console.log('$$$', popup)
      setPopupWindow(popup)
      popup.focus()
    } else {
      alert('Popup was blocked. Please allow popups for this site.')
    }
  }

  return (
    <div
      className="p-6"
      style={{
        display: 'flex',
        justifyContent: 'start',
        alignItems: 'start',
        border: 'none',
      }}
    >
      {roomMetadata ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'start',
            alignItems: 'start',
            border: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '1rem',
              alignItems: 'center',
            }}
          >
            <a
              className="join-button"
              href={roomMetadata.url}
              target={'_blank'}
              aria-label={`${joinButtonLabel} ${roomMetadata.slug && '(' + roomMetadata.slug + ')'}`}
            >
              <VisioIcon className="icon" />
              {joinButtonLabel}
            </a>
            <CopyButton roomUrl={roomMetadata.url} />
          </div>
          {!condensed && (
            <span className="join-link">
              {roomMetadata.url.replace('https://', '')}
            </span>
          )}
        </div>
      ) : (
        <button type="button" onClick={openPopup} className="create-meeting">
          <VisioIcon className="icon" />
          {createButtonLabel}
        </button>
      )}
    </div>
  )
}

const CopyButton = ({ roomUrl }: { roomUrl: string }) => {
  const [isCopied, setIsCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(roomUrl!)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 1000)
  }

  return (
    <button
      type="button"
      // variant={isCopied ? 'success' : 'quaternaryText'}
      style={{
        padding: '10px',
        width: '40px',
        height: '40px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        aspectRatio: '1/1',
        backgroundColor: 'transparent',
        border: 'none',
      }}
      onClick={copy}
    >
      {isCopied ? <CheckIcon /> : <CopyLineIcon />}
    </button>
  )
}

// export const VisioCreateButton = ({
//   onRoomCreated,
// }: {
//   onRoomCreated: (roomUrl: string) => void
// }) => {
//   useEffect(() => {
//     const onMessage = (event: MessageEvent) => {
//       // Make sure it is the correct origin.
//       if (event.origin !== new URL(DEFAULT_CONFIG.url).origin) {
//         return
//       }
//       if (event.data.type === ClientMessageType.ROOM_CREATED) {
//         const data = event.data.data
//         const roomUrl = data.url
//         onRoomCreated(roomUrl)
//       }
//     }
//
//     window.addEventListener('message', onMessage)
//     return () => {
//       window.removeEventListener('message', onMessage)
//     }
//   }, [onRoomCreated])
//
//   return (
//     // eslint-disable-next-line jsx-a11y/iframe-has-title
//     // <iframe
//     //   allow="clipboard-read; clipboard-write"
//     //   src={DEFAULT_CONFIG.url + '/create-button'}
//     //   style={{
//     //     width: '100%',
//     //     height: '52px',
//     //     border: 'none',
//     //   }}
//     // ></iframe>
//     <>
//       <URLOpenerButton
//         url="https://meet.127.0.0.1.nip.io/sdk/create-button"
//         text="Open in New Tab"
//         openAsPopup={true}
//       />
//       <div>wip</div>
//     </>
//   )
// }

import { createRoot } from 'react-dom/client'
import React from 'react'
import { MenuItem } from 'react-aria-components'
import { menuRecipe } from '@/primitives/menuRecipe.ts'
import { useRoomContext } from '@livekit/components-react'
import { Button } from '@/primitives'
import { LeaveButton } from '@/features/rooms/livekit/components/controls/LeaveButton'
import { RoomContext } from '@livekit/components-react'
import { RiPictureInPicture2Line } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { HandToggle } from '@/features/rooms/livekit/components/controls/HandToggle'
import { Track } from 'livekit-client'
import { ScreenShareToggle } from '@/features/rooms/livekit/components/controls/ScreenShareToggle.tsx'
import { AudioDevicesControl } from '@/features/rooms/livekit/components/controls/Device/AudioDevicesControl.tsx'
import { VideoDeviceControl } from '@/features/rooms/livekit/components/controls/Device/VideoDeviceControl.tsx'
import { PiPOptionsButton } from '@/features/rooms/livekit/components/controls/Options/PiPOptionsMenuItems.tsx'

// Composant à afficher dans le PiP
const PiPContent = ({ room, onClose }) => {
  return (
    <RoomContext.Provider value={room}>
      <div
        className={css({
          height: '100vh',
          position: 'relative',
          backgroundColor: 'primaryDark.50 !important',
        })}
      >
        <h2>Room: {room?.name}</h2>
        <Button onPress={onClose} variant="danger">
          Close PiP
        </Button>
        <div
          className={css({
            position: 'absolute',
            margin: '0.25rem',
            marginBottom: '0.75rem',
            width: 'calc(100% - 0.5rem)',
            bottom: '0',
            left: '0',
            // border: '1px solid white',
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
          })}
        >
          <AudioDevicesControl
            hideMenu={true}
            onDeviceError={(error) => console.log(error)}
          />
          <VideoDeviceControl
            hideMenu={true}
            onDeviceError={(error) => console.log(error)}
          />
          <ScreenShareToggle onDeviceError={(error) => console.log(error)} />
          <HandToggle />
          <LeaveButton />
        </div>
      </div>
    </RoomContext.Provider>
  )
}

export const PiPMenuItem = () => {
  const room = useRoomContext()

  const openDocumentPiP = async () => {
    try {
      if (!('documentPictureInPicture' in window)) {
        alert('Document Picture-in-Picture not supported')
        return
      }

      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 400,
        height: 300,
      })

      // Copier les styles CSS
      const allCSS = [...document.styleSheets]
        .map((styleSheet) => {
          try {
            return [...styleSheet.cssRules].map((rule) => rule.cssText).join('')
          } catch (e) {
            return ''
          }
        })
        .filter(Boolean)
        .join('\n')

      const styleElement = pipWindow.document.createElement('style')
      styleElement.textContent = allCSS
      pipWindow.document.head.appendChild(styleElement)

      // Créer conteneur React
      const container = pipWindow.document.createElement('div')
      pipWindow.document.body.appendChild(container)

      // Render avec la valeur room passée
      const root = createRoot(container)
      root.render(
        <PiPContent
          room={room} // Passer l'objet room
          onClose={() => pipWindow.close()}
        />
      )

      // Nettoyage
      pipWindow.addEventListener('pagehide', () => {
        root.unmount()
      })
    } catch (error) {
      console.error('Failed to open PiP:', error)
    }
  }

  return (
    <MenuItem
      onAction={openDocumentPiP}
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      <RiPictureInPicture2Line size={20} />
      Open in PiP
    </MenuItem>
  )
}

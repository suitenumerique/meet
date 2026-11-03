import { useState, useMemo } from 'react'
import { Excalidraw, MainMenu, WelcomeScreen } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useTranslation } from 'react-i18next'
import { RiCloseLine } from '@remixicon/react'
import { useRoomContext } from '@livekit/components-react'
import { Button } from '@/primitives/Button'
import { css } from '@/styled-system/css'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useWhiteboard } from '../hooks/useWhiteboard'
import { useWhiteboardCollab } from '../hooks/useWhiteboardCollab'
import { useWhiteboardStorage } from '../hooks/useWhiteboardStorage'
import { MeetWhiteboardStorageAdapter } from '../adapters/MeetWhiteboardStorageAdapter'

export const WhiteboardStage = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'whiteboard' })
  const { closeWhiteboard, sharerName, canToggleWhiteboard, isReadOnly } =
    useWhiteboard()
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null)

  const room = useRoomContext()
  const roomData = useRoomData()
  const roomSlug = useMemo(() => {
    return roomData?.slug || room?.name || 'default-room'
  }, [room?.name, roomData?.slug])

  const storageAdapter = useMemo(() => new MeetWhiteboardStorageAdapter(), [])

  const { onFilesChange } = useWhiteboardStorage({
    excalidrawAPI,
    roomId: roomSlug,
    storage: storageAdapter,
  })

  const { onChange, onPointerUpdate } = useWhiteboardCollab({
    excalidrawAPI,
    isReadOnly,
    onChange: onFilesChange,
  })

  return (
    <div
      className={css({
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'box.border',
        backgroundColor: 'box.bg',
      })}
    >
      {/* Floating top bar for meeting controls */}
      <div
        className={css({
          position: 'absolute',
          top: '10px',
          right: '12px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        })}
      >
        {sharerName && (
          <span
            className={css({
              fontSize: 'xs',
              fontWeight: 'medium',
              paddingX: '8px',
              paddingY: '4px',
              borderRadius: '4px',
              backgroundColor: 'primaryDark.50',
              color: 'white',
              opacity: 0.9,
            })}
          >
            {t('sharedBy', { name: sharerName })}
          </span>
        )}
        {isReadOnly && (
          <span
            className={css({
              fontSize: 'xs',
              fontWeight: 'medium',
              paddingX: '8px',
              paddingY: '4px',
              borderRadius: '4px',
              backgroundColor: 'gray.800',
              color: 'white',
              opacity: 0.9,
            })}
          >
            {t('readOnly')}
          </span>
        )}
        {canToggleWhiteboard && (
          <Button
            square
            size="sm"
            variant="secondaryDark"
            aria-label={t('close')}
            tooltip={t('close')}
            onPress={() => closeWhiteboard(true)}
          >
            <RiCloseLine size={20} />
          </Button>
        )}
      </div>

      <div
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <Excalidraw
          viewModeEnabled={isReadOnly}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          onChange={onChange}
          onPointerUpdate={onPointerUpdate}
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
              export: false,
              saveAsImage: true,
              loadScene: false,
            },
          }}
        >
          <MainMenu>
            {!isReadOnly && <MainMenu.DefaultItems.ClearCanvas />}
            {!isReadOnly && <MainMenu.DefaultItems.ChangeCanvasBackground />}
            <MainMenu.DefaultItems.ToggleTheme />
          </MainMenu>
          <WelcomeScreen>
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Heading>
                {t('heading')}
              </WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItemHelp />
              </WelcomeScreen.Center.Menu>
            </WelcomeScreen.Center>
          </WelcomeScreen>
        </Excalidraw>
      </div>
    </div>
  )
}

import { useCallback, useRef } from 'react'
import { supportsScreenSharing } from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'
import { SidePanel } from '@/features/rooms/livekit/components/SidePanel'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { pipLayoutStore } from '../stores/pipLayoutStore'
import { useEscapeDismiss } from '../hooks/useEscapeDismiss'
import { usePipKeyboardShortcuts } from '../hooks/usePipKeyboardShortcuts'
import { usePipRestoreFocus } from '../hooks/usePipRestoreFocus'
import { PipControlBar } from './PipControlBar'
import { PipReactionsToolbar } from './PipReactionsToolbar'
import { PipStage } from './layouts/PipStage'

export const PipView = () => {
  const browserSupportsScreenSharing = supportsScreenSharing()
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture',
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const { isSidePanelOpen, closePanel } = useSidePanel(pipLayoutStore)

  // Escape closes the side panel instead of the whole PiP window.
  useEscapeDismiss(containerRef, isSidePanelOpen, closePanel)

  // Forward keyboard shortcuts (Ctrl+D, Ctrl+E, etc.) to the main store.
  usePipKeyboardShortcuts(containerRef)

  // Side panels open via a menu item that unmounts on click; fall back to the
  // options button so focus returns somewhere visible.
  const resolveTrigger = useCallback((activeEl: HTMLElement | null) => {
    if (activeEl?.tagName === 'DIV') {
      const doc = containerRef.current?.ownerDocument ?? document
      return doc.getElementById('room-options-trigger')
    }
    return activeEl
  }, [])
  usePipRestoreFocus(containerRef, isSidePanelOpen, { resolveTrigger })

  return (
    <PipContainer
      ref={containerRef}
      role="region"
      aria-label={t('windowLabel')}
    >
      <PipStage />
      <PipReactionsToolbar />
      <PipControlBar showScreenShare={browserSupportsScreenSharing} />
      <SidePanel store={pipLayoutStore} />
    </PipContainer>
  )
}

const PipContainer = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto auto',
    backgroundColor: 'primaryDark.50',
    // Disable LiveKit's own border-radius on tiles so our containers
    // (GridCell, Thumbnail, StageFrame) own the clipping exclusively.
    '--lk-border-radius': '4px',
    '& .lk-participant-tile': {
      height: '100%',
    },
    '& .lk-participant-media': {
      height: '100%',
    },
    '& .lk-participant-media-video': {
      height: '100%',
      objectFit: 'cover',
    },
    '& .lk-grid-layout': {
      height: '100%',
      width: '100%',
    },
  },
})

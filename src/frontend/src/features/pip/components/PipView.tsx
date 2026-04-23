import { supportsScreenSharing } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { SidePanel } from '@/features/rooms/livekit/components/SidePanel'
import { pipLayoutStore } from '../stores/pipLayoutStore'
import { PipControlBar } from './PipControlBar'
import { PipReactionsToolbar } from './PipReactionsToolbar'
import { PipStage } from './layouts/PipStage'


// Composition shell for the Picture-in-Picture window.
 
export const PipView = () => {
  const browserSupportsScreenSharing = supportsScreenSharing()

  return (
    <PipContainer>
      <PipStage />
      <PipReactionsToolbar />
      <PipControlBar showScreenShare={browserSupportsScreenSharing} />
      {/* Side panel (effects, settings, etc.) opens within PiP window. */}
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

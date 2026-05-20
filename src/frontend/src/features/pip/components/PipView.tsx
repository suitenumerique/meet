import { PipControlBar } from './PipControlBar'
import { PipFloatingReactions } from './PipFloatingReactions'
import { ReactionsToolbar } from '@/features/reactions/components/toolbar/ReactionsToolbar'
import { styled } from '@/styled-system/jsx'

const Container = styled('div', {
  base: {
    position: 'relative',
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

export const PipView = () => {
  return (
    <Container>
      <ReactionsToolbar adjustedCentering={false} />
      <PipControlBar showScreenShare={false} />
      <PipFloatingReactions />
    </Container>
  )
}

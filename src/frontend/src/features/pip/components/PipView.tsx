import { styled } from '@/styled-system/jsx'
import { PipControlBar } from './PipControlBar'
import { PipFloatingReactions } from './PipFloatingReactions'
import { PipStage } from './layout/PipStage'
import { ReactionsToolbar } from '@/features/reactions/components/toolbar/ReactionsToolbar'
import { useReactionsToolbar } from '@/features/reactions/hooks/useReactionsToolbar'
import { NotificationProvider } from '@/features/notifications/NotificationProvider'

const Container = styled('div', {
  base: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto auto',
    backgroundColor: 'primaryDark.50',
    transition: 'padding .5s cubic-bezier(0.4,0,0.2,1) 5ms',
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
  variants: {
    isReactionToolbarOpen: {
      true: {
        paddingBottom:
          'calc(var(--sizes-room-reaction-toolbar-height) + var(--sizes-room-control-bar) + 1.125rem)',
      },
      false: {
        paddingBottom: 'var(--sizes-room-control-bar)',
      },
    },
  },
})

export const PipView = () => {
  const { isOpen: isReactionToolbarOpen } = useReactionsToolbar()
  return (
    <Container isReactionToolbarOpen={isReactionToolbarOpen}>
      <PipStage />
      <ReactionsToolbar adjustedCentering={false} />
      <PipControlBar showScreenShare={false} />
      <PipFloatingReactions />
      <NotificationProvider bottom={30} />
    </Container>
  )
}

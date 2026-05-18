import { FocusScope } from '@react-aria/focus'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { ReactionButton } from './ReactionButton'
import { Emoji } from '../../types'
import { styled } from '@/styled-system/jsx'
import { useDelayUnmount } from '@/hooks/useDelayUnmount'
import { ReactionsKeyboardNavigation } from './ReactionsKeyboardNavigation'
import { ReactionButtonsContainer } from './ReactionButtonsContainer'

const Container = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 'var(--sizes-room-control-bar)',
    left: 0,
    right: 0,
    pointerEvents: 'none',
  },
})

export const ReactionsToolbar = () => {
  const { isOpen } = useReactionsToolbar()
  const shouldMount = useDelayUnmount(isOpen, 300)

  if (!shouldMount) return null

  return (
    <Container>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus*/}
      <FocusScope autoFocus>
        <ReactionsKeyboardNavigation>
          <ReactionButtonsContainer>
            {Object.values(Emoji).map((emoji) => (
              <ReactionButton key={emoji} emoji={emoji} />
            ))}
          </ReactionButtonsContainer>
        </ReactionsKeyboardNavigation>
      </FocusScope>
    </Container>
  )
}

import { useEffect, useRef } from 'react'
import { FocusScope } from '@react-aria/focus'
import { styled } from '@/styled-system/jsx'
import { useSnapshot } from 'valtio'
import { pipLayoutStore } from '../stores/pipLayoutStore'
import { useDelayUnmount } from '@/hooks/useDelayUnmount'
import { usePipElementSize } from '../hooks/usePipElementSize'
import { PipReactionsKeyboardNavigation } from './reactions/PipReactionsKeyboardNavigation'
import { PipReactionsPill } from './reactions/PipReactionsPill'

/**
 * Reactions toolbar for the PiP window. Owns only the open/close orchestration;
 * layout and pagination live in `PipReactionsPill`, keyboard nav in
 * `PipReactionsKeyboardNavigation`.
 */
export const PipReactionsToolbar = () => {
  const { showReactionsToolbar: isOpen } = useSnapshot(pipLayoutStore)
  // Unmount content after the close transition so hidden emojis leave the tab order.
  const renderContent = useDelayUnmount(isOpen, 500)
  const contentRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { width: availableWidth } = usePipElementSize(wrapperRef)

  // Mark the subtree inert during the fade-out so Tab can't land on it.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (isOpen) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [isOpen, renderContent])

  return (
    <Wrapper ref={wrapperRef} isOpen={isOpen}>
      {renderContent && (
        <div ref={contentRef}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <FocusScope autoFocus>
            <PipReactionsKeyboardNavigation>
              <PipReactionsPill
                isOpen={isOpen}
                availableWidth={availableWidth}
              />
            </PipReactionsKeyboardNavigation>
          </FocusScope>
        </div>
      )}
    </Wrapper>
  )
}

const Wrapper = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'center',
    overflow: 'hidden',
    maxHeight: 0,
    padding: '0 0.5rem',
    transition:
      'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), padding 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  variants: {
    isOpen: {
      true: {
        maxHeight: '60px',
        padding: '0.5rem 0.5rem 0.25rem',
      },
    },
  },
})

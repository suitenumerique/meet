import { useEffect, useRef } from 'react'
import { FocusScope } from '@react-aria/focus'
import { styled } from '@/styled-system/jsx'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { useDelayUnmount } from '@/hooks/useDelayUnmount'
import { usePipElementSize } from '@/features/pip/hooks/usePipElementSize'
import { ReactionsKeyboardNavigation } from './ReactionsKeyboardNavigation'
import { ReactionsPill } from './ReactionsPill'

type ReactionsToolbarProps = {
  toggleId?: string
  controlBarId?: string
}

export const ReactionsToolbar = ({
  toggleId = 'reactions-toggle',
  controlBarId = 'control-bar',
}: ReactionsToolbarProps) => {
  const { isOpen } = useReactionsToolbar()
  const renderContent = useDelayUnmount(isOpen, 500)
  const contentRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { width: availableWidth } = usePipElementSize(wrapperRef)

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
            <ReactionsKeyboardNavigation
              toggleId={toggleId}
              controlBarId={controlBarId}
            >
              <ReactionsPill isOpen={isOpen} availableWidth={availableWidth} />
            </ReactionsKeyboardNavigation>
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
    width: '100%',
    transition:
      'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), padding 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  variants: {
    isOpen: {
      true: {
        maxHeight: '60px',
        padding: '0.5rem 0',
      },
    },
  },
})

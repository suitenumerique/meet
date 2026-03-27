import { FocusScope, useFocusManager } from '@react-aria/focus'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { ReactionButton } from './ReactionButton'
import { Emoji } from '../../types'
import { styled } from '@/styled-system/jsx'
import { layoutStore } from '@/stores/layout'
import { getFirstControlBarFocusable } from '@/utils/dom'
import { useIsMobile } from '@/utils/useIsMobile'
import { useEffect, useRef, useState } from 'react'
import { useDelayUnmount } from '@/hooks/useDelayUnmount'
import { useTranslation } from 'react-i18next'

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

const StyledStrip = styled('div', {
  base: {
    display: 'flex',
    gap: '0.2rem',
    borderRadius: '21px',
    padding: '0.15rem',
    backgroundColor: 'primaryDark.100',
    opacity: 0,
    transform: 'translateY(3.25rem)',
    transition: 'opacity, transform',
    transitionDuration: '0.5s',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none',
  },
  variants: {
    isVisible: {
      true: {
        opacity: 1,
        transform: 'translateY(0)',
        pointerEvents: 'auto',
      },
    },
    desktopOffset: {
      true: {
        // Ideally this value should be calculated dynamically in JavaScript to keep
        // the reaction toolbar perfectly centered relative to the reaction toggle.
        // However, for simplicity and to follow a pragmatic 80/20 approach,
        // this value is currently hardcoded in CSS.
        marginRight: '30px',
      },
    },
  },
})

const Strip = ({ children }: { children: React.ReactNode }) => {
  const { isOpen } = useReactionsToolbar()
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)

  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // defer one frame so the browser paints opacity:0 first
      const id = requestAnimationFrame(() => setIsVisible(true))
      return () => cancelAnimationFrame(id)
    } else {
      setIsVisible(false)
    }
  }, [isOpen])

  return (
    <StyledStrip
      ref={ref}
      aria-hidden={!isOpen}
      isVisible={isVisible}
      desktopOffset={!isMobile}
    >
      {children}
    </StyledStrip>
  )
}

const KeyboardNavigation = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const focusManager = useFocusManager()

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const comingFromOutside = !e.currentTarget.contains(e.relatedTarget)
    if (comingFromOutside) {
      focusManager?.focusFirst()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
        focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowLeft':
        focusManager?.focusPrevious({ wrap: true })
        break
      case 'Escape':
        e.preventDefault()
        document.getElementById('reactions-toggle')?.focus()
        layoutStore.showReactionsToolbar = false
        break
      case 'Tab':
        if (!e.shiftKey) {
          e.preventDefault()
          getFirstControlBarFocusable('control-bar')?.focus()
        }
        break
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {children}
    </div>
  )
}

export const ReactionsToolbar = () => {
  const { isOpen } = useReactionsToolbar()
  const shouldMount = useDelayUnmount(isOpen, 300)

  if (!shouldMount) return null

  return (
    <Container>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus*/}
      <FocusScope autoFocus>
        <KeyboardNavigation>
          <Strip>
            {Object.values(Emoji).map((emoji) => (
              <ReactionButton key={emoji} emoji={emoji} />
            ))}
          </Strip>
        </KeyboardNavigation>
      </FocusScope>
    </Container>
  )
}

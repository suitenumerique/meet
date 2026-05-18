import { useEffect, useRef, useState } from 'react'
import { styled } from '@/styled-system/jsx'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { useIsMobile } from '@/utils/useIsMobile'

const StyledContainer = styled('div', {
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

export const ReactionButtonsContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
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
    <StyledContainer
      ref={ref}
      aria-hidden={!isOpen}
      isVisible={isVisible}
      desktopOffset={!isMobile}
    >
      {children}
    </StyledContainer>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { styled } from '@/styled-system/jsx'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { useIsMobile } from '@/utils/useIsMobile'
import { css } from '@/styled-system/css'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Button } from '@/primitives'

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
    borderRadius: '21px',
    backgroundColor: 'primaryDark.100',
    maxWidth: '100%',
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

const scrollViewport = css({
  display: 'flex',
  gap: '0.2rem',
  overflowX: 'auto',
  padding: '0.19rem',
  scrollBehavior: 'smooth',
  minWidth: 0,
  flex: '1 1 auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
  '& > *': {
    flexShrink: 0,
  },
})

const SCROLL_AMOUNT = 120 // roughly 3 buttons

export const ReactionButtonsContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { isOpen } = useReactionsToolbar()
  const isMobile = useIsMobile()

  const scrollRef = useRef<HTMLDivElement>(null)
  const { width } = useSize(scrollRef)

  const [isVisible, setIsVisible] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setOverflowing(el.scrollWidth > el.clientWidth + 1)
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setIsVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setIsVisible(false)
  }, [isOpen])

  useEffect(() => {
    updateArrows()
  }, [width, updateArrows])

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <StyledContainer
      aria-hidden={!isOpen}
      isVisible={isVisible}
      desktopOffset={!isMobile}
    >
      {overflowing && (
        <Button
          onPress={() => scrollBy(-SCROLL_AMOUNT)}
          variant="primaryTextDark"
          size="sm"
          isDisabled={atStart}
          round
        >
          <RiArrowLeftSLine />
        </Button>
      )}
      <div ref={scrollRef} className={scrollViewport} onScroll={updateArrows}>
        {children}
      </div>
      {overflowing && (
        <Button
          onPress={() => scrollBy(SCROLL_AMOUNT)}
          variant="primaryTextDark"
          size="sm"
          isDisabled={atEnd}
          round
        >
          <RiArrowRightSLine />
        </Button>
      )}
    </StyledContainer>
  )
}

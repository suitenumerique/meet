import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { styled } from '@/styled-system/jsx'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { useIsMobile } from '@/utils/useIsMobile'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Button } from '@/primitives'
import { ReactionsKeyboardNavigation } from './ReactionsKeyboardNavigation'
import { FocusScope } from '@react-aria/focus'

import { CONTROL_BAR_REGION_ID } from '@/features/layout/components/ControlBarRegion'
import { REACTIONS_TOGGLE_ID } from '../ReactionsToggle'

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
  },
})

const StyledScrollViewport = styled('div', {
  base: {
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
  },
})

const SCROLL_AMOUNT = 120 // roughly 3 buttons

export const ReactionButtonsContainer = ({
  children,
  adjustedCentering,
}: {
  children: React.ReactNode
  adjustedCentering?: boolean
}) => {
  const { isOpen } = useReactionsToolbar()
  const isMobile = useIsMobile()

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { width } = useSize(scrollRef)

  const [isVisible, setIsVisible] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [
    shouldBeCenteredWithToggleButton,
    setShouldBeCenteredWithToggleButton,
  ] = useState(false)
  const [rightOffset, setRightOffset] = useState(0)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setOverflowing(el.scrollWidth > el.clientWidth + 1)
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    if (isMobile || !adjustedCentering) return
    const region = document.getElementById(CONTROL_BAR_REGION_ID)
    if (!region) return
    const check = () => {
      setShouldBeCenteredWithToggleButton(
        window.innerWidth > region.clientWidth
      )
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(region)
    window.addEventListener('resize', check)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [isMobile, adjustedCentering])

  useLayoutEffect(() => {
    if (!shouldBeCenteredWithToggleButton || isMobile) {
      setRightOffset(0)
      return
    }

    const container = containerRef.current
    if (!container) return

    let frame = 0

    const align = () => {
      const toggle = document.getElementById(REACTIONS_TOGGLE_ID)
      if (!toggle) return
      const toggleRect = toggle.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const toggleCenterX = toggleRect.left + toggleRect.width / 2
      const containerCenterX = containerRect.left + containerRect.width / 2
      const shift = toggleCenterX - containerCenterX
      if (Math.abs(shift) < 0.5) return
      setRightOffset((prev) => prev - shift * 2)
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(align)
    }

    schedule()

    const ro = new ResizeObserver(schedule)
    ro.observe(container)
    const region = document.getElementById(CONTROL_BAR_REGION_ID)
    if (region) ro.observe(region)
    const toggle = document.getElementById(REACTIONS_TOGGLE_ID)
    if (toggle) ro.observe(toggle)

    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [shouldBeCenteredWithToggleButton, isMobile, isOpen])

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
      ref={containerRef}
      aria-hidden={!isOpen}
      isVisible={isVisible}
      style={
        shouldBeCenteredWithToggleButton && !isMobile && adjustedCentering
          ? { marginRight: `${rightOffset}px` }
          : { margin: '0 15px' }
      }
    >
      {overflowing && (
        <div aria-hidden="true">
          <Button
            onPress={() => scrollBy(-SCROLL_AMOUNT)}
            variant="primaryTextDark"
            size="sm"
            isDisabled={atStart}
            round
            excludeFromTabOrder
          >
            <RiArrowLeftSLine />
          </Button>
        </div>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-autofocus*/}
      <FocusScope autoFocus>
        <ReactionsKeyboardNavigation>
          <StyledScrollViewport ref={scrollRef} onScroll={updateArrows}>
            {children}
          </StyledScrollViewport>
        </ReactionsKeyboardNavigation>
      </FocusScope>
      {overflowing && (
        <div aria-hidden="true">
          <Button
            onPress={() => scrollBy(SCROLL_AMOUNT)}
            variant="primaryTextDark"
            size="sm"
            isDisabled={atEnd}
            round
            excludeFromTabOrder
          >
            <RiArrowRightSLine />
          </Button>
        </div>
      )}
    </StyledContainer>
  )
}

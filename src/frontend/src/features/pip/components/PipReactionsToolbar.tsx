import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { useSnapshot } from 'valtio'
import { pipLayoutStore } from '../stores/pipLayoutStore'
import { ReactionButton } from '@/features/reactions/components/toolbar/ReactionButton'
import { Emoji } from '@/features/reactions/types'

const EMOJIS = Object.values(Emoji)
const EMOJI_SLOT_WIDTH = 40
const ARROW_SLOT_WIDTH = 32
const PILL_HORIZONTAL_PADDING = 12

export const PipReactionsToolbar = () => {
  const { showReactionsToolbar: isOpen } = useSnapshot(pipLayoutStore)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [pageStart, setPageStart] = useState(0)

  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setIsVisible(true))
      return () => cancelAnimationFrame(id)
    } else {
      setIsVisible(false)
    }
  }, [isOpen])

  const updateWidth = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    setAvailableWidth(el.getBoundingClientRect().width)
  }, [])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    updateWidth()

    const RO =
      el.ownerDocument.defaultView?.ResizeObserver ?? window.ResizeObserver
    const observer = new RO(() => updateWidth())
    observer.observe(el)

    return () => observer.disconnect()
  }, [updateWidth])

  const { visibleEmojis, hasOverflow, canGoLeft, canGoRight } = useMemo(() => {
    const maxWithoutArrows = Math.max(
      1,
      Math.floor((availableWidth - PILL_HORIZONTAL_PADDING) / EMOJI_SLOT_WIDTH)
    )

    if (EMOJIS.length <= maxWithoutArrows) {
      return {
        visibleEmojis: EMOJIS,
        hasOverflow: false,
        canGoLeft: false,
        canGoRight: false,
      }
    }

    const visibleCount = Math.max(
      1,
      Math.floor(
        (availableWidth - PILL_HORIZONTAL_PADDING - ARROW_SLOT_WIDTH * 2) /
          EMOJI_SLOT_WIDTH
      )
    )
    const clampedStart = Math.min(pageStart, EMOJIS.length - visibleCount)

    return {
      visibleEmojis: EMOJIS.slice(clampedStart, clampedStart + visibleCount),
      hasOverflow: true,
      canGoLeft: clampedStart > 0,
      canGoRight: clampedStart + visibleCount < EMOJIS.length,
    }
  }, [pageStart, availableWidth])

  useEffect(() => {
    if (!hasOverflow) {
      setPageStart(0)
      return
    }
    const visibleCount = Math.max(
      1,
      Math.floor(
        (availableWidth - PILL_HORIZONTAL_PADDING - ARROW_SLOT_WIDTH * 2) /
          EMOJI_SLOT_WIDTH
      )
    )
    const maxStart = Math.max(0, EMOJIS.length - visibleCount)
    if (pageStart > maxStart) {
      setPageStart(maxStart)
    }
  }, [hasOverflow, pageStart, availableWidth])

  const paginate = useCallback((direction: 'left' | 'right') => {
    setPageStart((current) =>
      direction === 'left' ? Math.max(0, current - 1) : current + 1
    )
  }, [])

  return (
    <ToolbarWrapper ref={wrapperRef} isOpen={isOpen}>
      <ToolbarPill isVisible={isVisible}>
        {hasOverflow && (
          <ArrowSlot>
            {canGoLeft && (
              <ArrowButton
                onClick={() => paginate('left')}
                aria-label="Previous reactions"
              >
                <RiArrowLeftSLine size={16} />
              </ArrowButton>
            )}
          </ArrowSlot>
        )}
        <EmojiRow>
          {visibleEmojis.map((emoji) => (
            <ReactionButton key={emoji} emoji={emoji} />
          ))}
        </EmojiRow>
        {hasOverflow && (
          <ArrowSlot>
            {canGoRight && (
              <ArrowButton
                onClick={() => paginate('right')}
                aria-label="Next reactions"
              >
                <RiArrowRightSLine size={16} />
              </ArrowButton>
            )}
          </ArrowSlot>
        )}
      </ToolbarPill>
    </ToolbarWrapper>
  )
}

const ToolbarWrapper = styled('div', {
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

const ToolbarPill = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
    borderRadius: '21px',
    padding: '0.15rem',
    backgroundColor: 'primaryDark.100',
    maxWidth: '100%',
    overflow: 'hidden',
    width: 'fit-content',
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

const EmojiRow = styled('div', {
  base: {
    display: 'flex',
    gap: '0.2rem',
    '& > *': {
      flexShrink: 0,
    },
  },
})

const ArrowSlot = styled('div', {
  base: {
    width: '32px',
    minWidth: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

const ArrowButton = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={css({
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      border: 'none',
      backgroundColor: 'primaryDark.200',
      color: 'white',
      cursor: 'pointer',
      opacity: 0.85,
      _hover: {
        opacity: 1,
        backgroundColor: 'primaryDark.300',
      },
    })}
    {...props}
  >
    {children}
  </button>
)

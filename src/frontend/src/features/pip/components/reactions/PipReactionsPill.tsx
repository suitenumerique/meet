import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { styled } from '@/styled-system/jsx'
import { ReactionButton } from '@/features/reactions/components/toolbar/ReactionButton'
import {
  computeReactionsPage,
  getMaxPageStart,
} from '../../utils/pipReactionsPagination'

type Props = { isOpen: boolean; availableWidth: number }

/**
 * Paginated emoji pill with animated entry/exit. Responsibility: layout the
 * visible emojis for the currently available width and expose prev/next arrows.
 */
export const PipReactionsPill = ({ isOpen, availableWidth }: Props) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture',
  })
  const [isVisible, setIsVisible] = useState(false)
  const [pageStart, setPageStart] = useState(0)

  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false)
      return
    }
    const id = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(id)
  }, [isOpen])

  const { visibleEmojis, hasOverflow, canGoLeft, canGoRight, visibleCount } =
    useMemo(
      () => computeReactionsPage(availableWidth, pageStart),
      [availableWidth, pageStart]
    )

  // Clamp pageStart if the window was resized and the current page no longer fits.
  useEffect(() => {
    if (!hasOverflow) {
      setPageStart(0)
      return
    }
    const maxStart = getMaxPageStart(visibleCount)
    if (pageStart > maxStart) setPageStart(maxStart)
  }, [hasOverflow, pageStart, visibleCount])

  const paginate = useCallback((direction: 'left' | 'right') => {
    setPageStart((current) =>
      direction === 'left' ? Math.max(0, current - 1) : current + 1
    )
  }, [])

  return (
    <Pill isVisible={isVisible}>
      {hasOverflow && (
        <ArrowSlot>
          {canGoLeft && (
            <ArrowButton
              type="button"
              onClick={() => paginate('left')}
              aria-label={t('previousReactions')}
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
              type="button"
              onClick={() => paginate('right')}
              aria-label={t('nextReactions')}
            >
              <RiArrowRightSLine size={16} />
            </ArrowButton>
          )}
        </ArrowSlot>
      )}
    </Pill>
  )
}

const Pill = styled('div', {
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

const ArrowButton = styled('button', {
  base: {
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
  },
})

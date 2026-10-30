import { type KeyboardEvent, type RefObject, useRef } from 'react'
import { mergeProps, useMove } from 'react-aria'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { resetCarouselRatio, setCarouselRatio } from '@/stores/focusLayout'
import {
  clampCarouselRatio,
  getMinCarouselRatio,
  KEYBOARD_STEP,
  MAX_CAROUSEL_RATIO,
} from '@/features/layout/utils/focusLayoutSplit'

export const CAROUSEL_RATIO_VAR = '--carousel-ratio'

interface FocusLayoutResizerProps {
  containerRef: RefObject<HTMLDivElement>
  ratio: number
  layoutWidth: number
}

/**
 * Draggable separator between the carousel and the focused tile. While
 * dragging it only updates a CSS variable on the container, so the stage does
 * not re-render on every pointer move. The ratio is saved when the move ends.
 */
export const FocusLayoutResizer = ({
  containerRef,
  ratio,
  layoutWidth,
}: FocusLayoutResizerProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'focusLayoutResizer' })

  // Unclamped ratio following the pointer, so the handle stays under the
  // cursor when it comes back from beyond a bound.
  const rawRatioRef = useRef(ratio)
  const liveRatioRef = useRef(ratio)

  const preview = (next: number) => {
    rawRatioRef.current = next
    liveRatioRef.current = clampCarouselRatio(next, layoutWidth)
    containerRef.current?.style.setProperty(
      CAROUSEL_RATIO_VAR,
      String(liveRatioRef.current)
    )
  }

  const { moveProps } = useMove({
    onMoveStart() {
      rawRatioRef.current = ratio
      liveRatioRef.current = ratio
    },
    onMove(e) {
      if (e.pointerType === 'keyboard') {
        preview(liveRatioRef.current + Math.sign(e.deltaX) * KEYBOARD_STEP)
        return
      }
      if (layoutWidth <= 0) return
      preview(rawRatioRef.current + e.deltaX / layoutWidth)
    },
    onMoveEnd() {
      setCarouselRatio(liveRatioRef.current)
    },
  })

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'Home':
        e.preventDefault()
        setCarouselRatio(getMinCarouselRatio(layoutWidth))
        break
      case 'End':
        e.preventDefault()
        setCarouselRatio(MAX_CAROUSEL_RATIO)
        break
      case 'Enter':
        e.preventDefault()
        resetCarouselRatio()
        break
    }
  }

  const percent = Math.round(ratio * 100)

  return (
    <div
      {...mergeProps(moveProps, { onKeyDown: handleKeyDown })}
      role="separator"
      // A focusable separator is the WAI-ARIA window splitter pattern, which
      // jsx-a11y does not count as an interactive role.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t('label')}
      aria-valuenow={percent}
      aria-valuemin={Math.round(getMinCarouselRatio(layoutWidth) * 100)}
      aria-valuemax={Math.round(MAX_CAROUSEL_RATIO * 100)}
      aria-valuetext={t('value', { percent })}
      title={t('hint')}
      onDoubleClick={resetCarouselRatio}
      className={css({
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '1rem',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'col-resize',
        touchAction: 'none',
        outline: 'none',
        borderRadius: '4px',
        '& > span': {
          width: '4px',
          height: '3rem',
          borderRadius: '2px',
          backgroundColor: 'white',
          opacity: 0,
          transition: 'opacity 200ms linear',
        },
        _hover: {
          '& > span': { opacity: 0.6 },
        },
        _active: {
          '& > span': { opacity: 0.9 },
        },
        _focusVisible: {
          outline: '2px solid white',
          '& > span': { opacity: 0.9 },
        },
      })}
      style={{
        left: `calc(var(${CAROUSEL_RATIO_VAR}) * 100% + var(--lk-grid-gap) / 2)`,
        transform: 'translateX(-50%)',
      }}
    >
      <span aria-hidden />
    </div>
  )
}

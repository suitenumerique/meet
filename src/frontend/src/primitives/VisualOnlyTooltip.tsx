import {
  type ReactElement,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { css } from '@/styled-system/css'
import { useUNSAFE_PortalContext } from '@react-aria/overlays'

export type VisualOnlyTooltipProps = {
  children: ReactElement
  tooltip: string
  ariaLabel?: string
  tooltipPosition?: 'top' | 'bottom'
}

/**
 * Wrapper component that displays a tooltip visually only (not announced by screen readers).
 *
 * This is necessary because TooltipTrigger from react-aria-components automatically adds
 * aria-describedby on the button, which links the tooltip for accessibility.
 * Even with aria-hidden="true" on the tooltip, screen readers still announce its content → duplication.
 * This CSS wrapper avoids TooltipTrigger → no automatic aria-describedby → no duplication.
 *
 * Uses a portal to avoid being clipped by parent containers with overflow: hidden.
 */
export const VisualOnlyTooltip = ({
  children,
  tooltip,
  ariaLabel,
  tooltipPosition = 'top',
}: VisualOnlyTooltipProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const { getContainer } = useUNSAFE_PortalContext()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const [computedStyle, setComputedStyle] = useState<{
    left: number
    arrowLeft: number
  } | null>(null)

  const [effectiveBottom, setEffectiveBottom] = useState(
    tooltipPosition === 'bottom'
  )

  const showTooltip = () => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const preferBottom = tooltipPosition === 'bottom'
    setEffectiveBottom(preferBottom)
    setPosition({
      top: preferBottom ? rect.bottom + 8 : rect.top - 8,
      left: rect.left + rect.width / 2,
    })
    setIsVisible(true)
  }

  const hideTooltip = () => {
    setIsVisible(false)
    setPosition(null)
    setComputedStyle(null)
  }

  useLayoutEffect(() => {
    if (!tooltipRef.current || !wrapperRef.current || !isVisible || !position)
      return
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const triggerRect = wrapperRef.current.getBoundingClientRect()
    const doc = tooltipRef.current.ownerDocument
    const viewportWidth = doc.defaultView?.innerWidth ?? globalThis.innerWidth
    const padding = 8

    // Vertical flip: if tooltip overflows the top, switch to bottom
    if (!effectiveBottom && position.top - tooltipRect.height < 0) {
      const flippedTop = triggerRect.bottom + 8
      setEffectiveBottom(true)
      setPosition({ top: flippedTop, left: position.left })
      return
    }

    // Horizontal clamping (both edges)
    const desiredLeft = position.left - tooltipRect.width / 2
    const minLeft = padding
    const maxLeft = viewportWidth - padding - tooltipRect.width

    if (desiredLeft >= minLeft && desiredLeft <= maxLeft) {
      setComputedStyle(null)
      return
    }

    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft))
    setComputedStyle({
      left: clampedLeft,
      arrowLeft: position.left - clampedLeft,
    })
  }, [isVisible, position, effectiveBottom])

  const portalContainer = useMemo(() => {
    if (getContainer) return getContainer()
    return wrapperRef.current?.ownerDocument?.body ?? document.body
  }, [getContainer])
  const wrappedChild = isValidElement(children)
    ? cloneElement(children, {
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      })
    : children

  return (
    <>
      <div
        ref={wrapperRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {wrappedChild}
      </div>
      {isVisible &&
        position &&
        portalContainer &&
        createPortal(
          <div
            aria-hidden="true"
            role="presentation"
            ref={tooltipRef}
            className={css({
              position: 'fixed',
              padding: '2px 8px',
              backgroundColor: 'primaryDark.100',
              color: 'gray.100',
              borderRadius: '4px',
              fontSize: 14,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100001,
              boxShadow: '0 8px 20px rgba(0 0 0 / 0.1)',
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 'var(--tooltip-arrow-left, 50%)',
                transform: 'translateX(-50%)',
                border: '4px solid transparent',
                ...(effectiveBottom
                  ? {
                      bottom: '100%',
                      borderBottomColor: 'primaryDark.100',
                    }
                  : {
                      top: '100%',
                      borderTopColor: 'primaryDark.100',
                    }),
              },
            })}
            style={{
              top: `${position.top}px`,
              left: computedStyle
                ? `${computedStyle.left}px`
                : `${position.left}px`,
              transform: computedStyle
                ? effectiveBottom
                  ? 'translateY(0)'
                  : 'translateY(-100%)'
                : effectiveBottom
                  ? 'translate(-50%, 0)'
                  : 'translate(-50%, -100%)',
              ...(computedStyle
                ? {
                    '--tooltip-arrow-left': `${computedStyle.arrowLeft}px`,
                  }
                : null),
            }}
          >
            {tooltip}
          </div>,
          portalContainer
        )}
    </>
  )
}

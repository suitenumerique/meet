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

  const isBottom = tooltipPosition === 'bottom'

  const showTooltip = () => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    setPosition({
      top: isBottom ? rect.bottom + 8 : rect.top - 8,
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
    if (!tooltipRef.current || !isVisible || !position) return
    const tooltipWidth = tooltipRef.current.getBoundingClientRect().width
    const doc = tooltipRef.current.ownerDocument
    const viewportWidth = doc.defaultView?.innerWidth ?? window.innerWidth
    const padding = 8
    const desiredLeft = position.left - tooltipWidth / 2
    const maxLeft = viewportWidth - padding - tooltipWidth
    if (desiredLeft <= maxLeft) {
      setComputedStyle(null)
      return
    }
    setComputedStyle({ left: maxLeft, arrowLeft: position.left - maxLeft })
  }, [isVisible, position])

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
                ...(isBottom
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
                ? isBottom
                  ? 'translateY(0)'
                  : 'translateY(-100%)'
                : isBottom
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

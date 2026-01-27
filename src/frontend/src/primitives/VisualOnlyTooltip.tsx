import {
  type ReactElement,
  cloneElement,
  isValidElement,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { css } from '@/styled-system/css'

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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
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
  }

  const tooltipData = isVisible && position ? { isVisible, position } : null
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
      {tooltipData &&
        createPortal(
          <div
            aria-hidden="true"
            role="presentation"
            className={css({
              position: 'fixed',
              padding: '2px 8px',
              backgroundColor: 'primaryDark.100',
              color: 'gray.100',
              borderRadius: '4px',
              fontSize: 14,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 9999,
              boxShadow: '0 8px 20px rgba(0 0 0 / 0.1)',
              '&::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
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
              top: `${tooltipData.position.top}px`,
              left: `${tooltipData.position.left}px`,
              transform: isBottom
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -100%)',
            }}
          >
            {tooltip}
          </div>,
          document.body
        )}
    </>
  )
}

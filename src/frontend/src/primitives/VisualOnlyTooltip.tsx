import { type ReactNode, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { css } from '@/styled-system/css'
import { useUNSAFE_PortalContext } from '@react-aria/overlays'

export type VisualOnlyTooltipProps = {
  children: ReactNode
  tooltip: string
}

const TOOLTIP_VERTICAL_OFFSET_PX = 8

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
}: VisualOnlyTooltipProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const { getContainer } = useUNSAFE_PortalContext()

  const getPosition = () => {
    if (!wrapperRef.current) return null
    const rect = wrapperRef.current.getBoundingClientRect()
    return {
      top: rect.top - TOOLTIP_VERTICAL_OFFSET_PX,
      left: rect.left + rect.width / 2,
    }
  }

  const position = getPosition()
  const tooltipData = isVisible && position ? { isVisible, position } : null

  const portalContainer = useMemo(() => {
    if (getContainer) return getContainer()
    return wrapperRef.current?.ownerDocument?.body ?? document.body
  }, [getContainer])

  return (
    <>
      <div
        ref={wrapperRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
      >
        {children}
      </div>
      {tooltipData &&
        portalContainer &&
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
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                border: '4px solid transparent',
                borderTopColor: 'primaryDark.100',
              },
            })}
            style={{
              top: `${tooltipData.position.top}px`,
              left: `${tooltipData.position.left}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            {tooltip}
          </div>,
          portalContainer
        )}
    </>
  )
}

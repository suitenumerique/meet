import { ReactNode, useMemo } from 'react'
import { MenuTrigger } from 'react-aria-components'
import { StyledPopover } from './Popover'
import { Box } from './Box'
import {
  useOverlayBoundaryElement,
  useOverlayPortalContainer,
} from './useOverlayPortalContainer'

/**
 * a Menu is a tuple of a trigger component (most usually a Button) that toggles menu items in a tooltip around the trigger
 *
 * Uses UNSAFE_PortalProvider context automatically for portal container (no need for UNSTABLE_portalContainer).
 */
export const Menu = ({
  children,
  variant = 'light',
  placement,
}: {
  children: [trigger: ReactNode, menu: ReactNode]
  variant?: 'dark' | 'light'
  placement?: 'bottom' | 'top' | 'left' | 'right'
}) => {
  const [trigger, menu] = children
  const boundaryElement = useOverlayBoundaryElement()
  const portalContainer = useOverlayPortalContainer()
  
  // Detect if we're in PiP: portal container is in a different document than the main window
  const isInPiP = useMemo(
    () =>
      portalContainer &&
      portalContainer.ownerDocument &&
      portalContainer.ownerDocument !== document,
    [portalContainer]
  )

  // Default placement: 'bottom' in PiP, 'top' elsewhere (to match existing behavior)
  const defaultPlacement = isInPiP ? 'bottom' : 'top'
  const shouldFlip = isInPiP ? false : undefined

  return (
    <MenuTrigger>
      {trigger}
      <StyledPopover
        placement={placement ?? defaultPlacement}
        shouldFlip={shouldFlip}
        boundaryElement={boundaryElement}
      >
        <Box size="sm" type="popover" variant={variant}>
          {menu}
        </Box>
      </StyledPopover>
    </MenuTrigger>
  )
}

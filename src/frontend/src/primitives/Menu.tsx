import { ReactNode } from 'react'
import { MenuTrigger } from 'react-aria-components'
import { StyledPopover } from './Popover'
import { Box } from './Box'
import { useOverlayBoundaryElement } from './useOverlayPortalContainer'

/**
 * a Menu is a tuple of a trigger component (most usually a Button) that toggles menu items in a tooltip around the trigger
 *
 * Uses UNSAFE_PortalProvider context automatically for portal container (no need for UNSTABLE_portalContainer).
 */
export const Menu = ({
  children,
  variant = 'light',
  placement = 'top',
}: {
  children: [trigger: ReactNode, menu: ReactNode]
  variant?: 'dark' | 'light'
  placement?: 'bottom' | 'top' | 'left' | 'right'
}) => {
  const [trigger, menu] = children
  const boundaryElement = useOverlayBoundaryElement()

  return (
    <MenuTrigger>
      {trigger}
      <StyledPopover
        placement={placement}
        boundaryElement={boundaryElement}
      >
        <Box size="sm" type="popover" variant={variant}>
          {menu}
        </Box>
      </StyledPopover>
    </MenuTrigger>
  )
}

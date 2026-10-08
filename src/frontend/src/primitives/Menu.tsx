import { ReactNode } from 'react'
import { MenuTrigger } from 'react-aria-components'
import { StyledPopover } from './StyledPopover'
import { Box } from './Box'

/**
 * a Menu is a tuple of a trigger component (most usually a Button) that toggles menu items in a tooltip around the trigger
 */
export const Menu = ({
  children,
  variant = 'light',
  placement,
  onOpenChange,
}: {
  children: [trigger: ReactNode, menu: ReactNode]
  variant?: 'dark' | 'light'
  placement?: 'bottom' | 'top' | 'left' | 'right'
  onOpenChange?: (isOpen: boolean) => void
}) => {
  const [trigger, menu] = children
  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      {trigger}
      <StyledPopover placement={placement}>
        <Box size="sm" type="popover" variant={variant}>
          {menu}
        </Box>
      </StyledPopover>
    </MenuTrigger>
  )
}

import { ReactNode } from 'react'
import {
  DialogProps,
  DialogTrigger,
  Dialog,
  OverlayArrow,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { Box } from './Box'
import { StyledPopover } from './StyledPopover'

const StyledOverlayArrow = styled(OverlayArrow, {
  base: {
    display: 'block',
    fill: 'box.bg',
    stroke: 'box.border',
    strokeWidth: 1,
    '&[data-placement="bottom"] svg': {
      transform: 'rotate(180deg) translateY(-1px)',
    },
  },
  variants: {
    variant: {
      light: {},
      dark: {
        fill: 'primaryDark.50',
        stroke: 'primaryDark.50',
      },
    },
  },
  defaultVariants: {
    variant: 'light',
  },
})

/**
 * a Popover is a tuple of a trigger component (most usually a Button) that toggles some content in a tooltip around the trigger
 *
 * Note: to show a list of actionable items, like a dropdown menu, prefer using a <Menu> or <Select>.
 * This is here when needing to show unrestricted content in a box.
 */
export const Popover = ({
  children,
  variant = 'light',
  withArrow = true,
  isOpen,
  defaultOpen,
  onOpenChange,
  ...dialogProps
}: {
  children: [
    trigger: ReactNode,
    popoverContent:
      | (({ close }: { close: () => void }) => ReactNode)
      | ReactNode,
  ]
  variant?: 'dark' | 'light'
  withArrow?: boolean
  /** Controlled open state, forwarded to the underlying `DialogTrigger`. */
  isOpen?: boolean
  /** Uncontrolled initial open state, forwarded to `DialogTrigger`. */
  defaultOpen?: boolean
  /** Notified when the popover opens/closes (press, escape, outside click). */
  onOpenChange?: (isOpen: boolean) => void
} & Omit<DialogProps, 'children'>) => {
  const [trigger, popoverContent] = children
  return (
    <DialogTrigger
      isOpen={isOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {trigger}
      <StyledPopover>
        {withArrow && (
          <StyledOverlayArrow variant={variant}>
            <svg width={12} height={12} viewBox="0 0 12 12">
              <path d="M0 0 L6 6 L12 0" />
            </svg>
          </StyledOverlayArrow>
        )}
        <Dialog {...dialogProps}>
          {({ close }) => (
            <Box size="sm" type="popover" variant={variant}>
              {typeof popoverContent === 'function'
                ? popoverContent({ close })
                : popoverContent}
            </Box>
          )}
        </Dialog>
      </StyledPopover>
    </DialogTrigger>
  )
}

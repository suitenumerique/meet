import { ReactNode } from 'react'
import {
  DialogProps,
  DialogTrigger,
  Popover as RACPopover,
  Dialog,
  OverlayArrow,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { Box } from './Box'

const StyledPopover = styled(RACPopover, {
  base: {
    '&[data-placement="bottom"]': {
      marginTop: 0.25,
    },
  },
})

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
})

/**
 * a Popover is a tuple of a trigger component (most usually a Button) that toggles some interactive content in a tooltip around the trigger
 */
export const Popover = ({
  children,
  ...dialogProps
}: {
  children: [
    trigger: ReactNode,
    popoverContent:
      | (({ close }: { close: () => void }) => ReactNode)
      | ReactNode,
  ]
} & DialogProps) => {
  const [trigger, popoverContent] = children
  return (
    <DialogTrigger>
      {trigger}
      <StyledPopover>
        <StyledOverlayArrow>
          <svg width={12} height={12} viewBox="0 0 12 12">
            <path d="M0 0 L6 6 L12 0" />
          </svg>
        </StyledOverlayArrow>
        <Dialog {...dialogProps}>
          {({ close }) => (
            <Box size="sm" type="popover">
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

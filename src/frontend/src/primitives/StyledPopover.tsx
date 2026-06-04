import { Popover as RACPopover } from 'react-aria-components'
import { styled } from '@/styled-system/jsx'

export const StyledPopover = styled(RACPopover, {
  base: {
    minWidth: 'var(--trigger-width)',
    '&[data-entering]': {
      animation: 'slide 200ms',
    },
    '&[data-exiting]': {
      animation: 'slide 200ms reverse ease-in',
    },
    '&[data-placement="bottom"]': {
      marginTop: 0.25,
    },
    '&[data-placement=top]': {
      '--origin': 'translateY(8px)',
    },
    '&[data-placement=bottom]': {
      '--origin': 'translateY(-8px)',
    },
    '&[data-placement=right]': {
      '--origin': 'translateX(-8px)',
    },
    '&[data-placement=left]': {
      '--origin': 'translateX(8px)',
    },
  },
})

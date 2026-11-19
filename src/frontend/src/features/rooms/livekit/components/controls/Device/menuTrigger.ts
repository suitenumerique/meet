import { css } from '@/styled-system/css'

/**
 * Style of the button opening the menu of a device, next to its toggle.
 */
export const menuTrigger = css({
  '& svg': {
    transition: 'transform 200ms',
  },
  // the chevron points down while the menu is open
  '&[aria-expanded=true] svg': {
    transform: 'rotate(180deg)',
  },
})

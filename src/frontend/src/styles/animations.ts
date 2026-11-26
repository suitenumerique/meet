import { css } from '@/styled-system/css'

/**
 * Flips the chevron of a trigger while what it opens (menu, popover, list of
 * a select) is displayed. To set on the chevron itself: it follows the
 * `aria-expanded` attribute of the trigger it belongs to.
 *
 *   <Button>
 *     <RiArrowDownSLine className={chevronFlip} />
 *   </Button>
 *
 * The keyframes are declared in the theme, with the other ones.
 */
export const chevronFlip = css({
  '[aria-expanded=false] &': {
    animation: 'chevron_flip_close 200ms',
  },
  '[aria-expanded=true] &': {
    transform: 'rotate(180deg)',
    animation: 'chevron_flip_open 200ms',
  },
  _motionReduce: {
    animation: 'none!',
  },
})

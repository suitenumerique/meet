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
 *
 * A CSS animation starts as soon as its rule applies, which includes the
 * first render of a collapsed trigger. So the closing animation starts from
 * `--chevron-flip-angle`, the angle the chevron was left at: 0 until the
 * trigger is expanded once, which makes it invisible on the first render.
 * The variable is registered in `panda.config.ts`, to be transitioned.
 */
export const chevronFlip = css({
  '[aria-expanded=false] &': {
    animation: 'chevron_flip_close 200ms',
    // Keeps the angle of the expanded state while the animation needs it: the
    // return to 0 is delayed, way after its end.
    transition: '--chevron-flip-angle 0s 1s',
  },
  '[aria-expanded=true] &': {
    '--chevron-flip-angle': '180deg',
    transform: 'rotate(180deg)',
    animation: 'chevron_flip_open 200ms',
  },
  _motionReduce: {
    animation: 'none!',
  },
})

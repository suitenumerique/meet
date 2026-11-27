import { css, cva } from '@/styled-system/css'

/**
 * Wrapper of a select in the menu of a device. Its width is fixed, so the menu
 * keeps its size when the list of devices is loaded, or when another device,
 * with a longer or a shorter name, is selected.
 */
export const menuSelect = css({
  width: '16rem',
  flexShrink: 1,
  minWidth: 0,
})

/**
 * Button that opens the menu of a device, next to the one that toggles it.
 * At rest, it is darker than its neighbor: toggling is the main action of the
 * pair. It takes the colors of its variant back when hovered or pressed.
 */
export const menuTrigger = cva({
  base: {
    '&:not([data-hovered]):not([data-pressed])': {
      backgroundColor: 'gray.800!',
      color: 'gray.300!',
    },
  },
  variants: {
    // the device is off, or cannot be used
    muted: {
      true: {
        '&:not([data-hovered]):not([data-pressed])': {
          backgroundColor: 'error.800!',
          color: 'error.300!',
        },
      },
    },
  },
})

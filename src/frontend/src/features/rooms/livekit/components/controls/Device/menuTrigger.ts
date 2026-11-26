import { css } from '@/styled-system/css'

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

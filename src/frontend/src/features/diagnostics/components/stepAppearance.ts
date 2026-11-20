import { css } from '@/styled-system/css'
import type { ConnectionTestStepStatus } from '../types'

/**
 * Panda extracts styles statically, so every status needs its own literal
 * `css()` call: `css({ backgroundColor: someVariable })` would emit nothing.
 */
export const statusSquareClass: Record<ConnectionTestStepStatus, string> = {
  pending: css({
    backgroundColor: 'transparent',
    border: '1px solid {colors.gray.150}',
  }),
  running: css({
    backgroundColor: 'brand.550',
    animation: 'pulse_background 1.2s ease-in-out infinite',
  }),
  success: css({ backgroundColor: 'background.semantic.success.primary' }),
  warning: css({ backgroundColor: 'background.semantic.warning.primary' }),
  failed: css({ backgroundColor: 'background.semantic.error.primary' }),
  skipped: css({ backgroundColor: 'gray.150' }),
}

/**
 * Colour is carried by the square; the label stays near-black except on
 * failure and warning.
 */
export const statusTextClass: Record<ConnectionTestStepStatus, string> = {
  pending: css({ color: 'greyscale.600' }),
  running: css({ color: 'greyscale.700' }),
  success: css({ color: 'greyscale.1000' }),
  warning: css({ color: 'warning', fontWeight: 'medium' }),
  failed: css({ color: 'danger.600', fontWeight: 'medium' }),
  skipped: css({ color: 'greyscale.600' }),
}

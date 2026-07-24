import { css } from '@/styled-system/css'
import type { ConnectionTestStepStatus } from '../types'

/**
 * Panda extracts styles statically, so every status needs its own literal
 * `css()` call: `css({ backgroundColor: someVariable })` would emit nothing.
 */
export const statusSquareClass: Record<ConnectionTestStepStatus, string> = {
  pending: css({
    backgroundColor: 'transparent',
    border: '1px solid {colors.greyscale.300}',
  }),
  running: css({
    backgroundColor: 'primary.800',
    animation: 'pulse_background 1.2s ease-in-out infinite',
  }),
  success: css({ backgroundColor: 'success.600' }),
  failed: css({ backgroundColor: 'danger.600' }),
  skipped: css({ backgroundColor: 'greyscale.300' }),
}

/** Colour is carried by the square; the label stays near-black except on failure. */
export const statusTextClass: Record<ConnectionTestStepStatus, string> = {
  pending: css({ color: 'greyscale.500' }),
  running: css({ color: 'greyscale.700' }),
  success: css({ color: 'greyscale.1000' }),
  failed: css({ color: 'danger.600', fontWeight: 'medium' }),
  skipped: css({ color: 'greyscale.500' }),
}

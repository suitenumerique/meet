import { styled } from '@/styled-system/jsx'
import { Input as RACInput } from 'react-aria-components'

/**
 * Styled RAC Input.
 *
 * Used internally by Fields.
 */
export const Input = styled(RACInput, {
  base: {
    width: 'full',
    paddingY: '3xs',
    paddingX: 'xs',
    border: '1px solid',
    borderColor: 'border.semantic.neutral.tertiary',
    color: 'content.semantic.neutral.primary',
    borderRadius: 4,
    // The field of the UI kit: its border thickens on hover, with a ring of
    // the same color, and turns to the brand color when focused.
    boxShadow: '0 0 0 0 {colors.border.semantic.neutral.tertiary}',
    transition: 'border-color 250ms ease-out, box-shadow 250ms ease-out',
    '&[data-hovered]:not([data-focused])': {
      boxShadow: '0 0 0 1px {colors.border.semantic.neutral.tertiary}',
    },
    '&[data-focused]': {
      borderColor: 'border.semantic.brand.primary',
      boxShadow: '0 0 0 1px {colors.border.semantic.brand.primary}',
      outline: 'none!',
    },
  },
})

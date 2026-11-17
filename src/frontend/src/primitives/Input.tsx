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
    borderColor: 'border.semantic.neutral.primary',
    color: 'content.semantic.neutral.primary',
    borderRadius: 4,
    transition: 'all 200ms',
  },
})

import { styled } from '@/styled-system/jsx'
import { Text, type TextProps } from 'react-aria-components'

const StyledDescription = styled(Text, {
  base: {
    display: 'block',
    textStyle: 'sm',
    color: 'default.subtle-text',
    marginBottom: 0.125,
  },
})

/**
 * Styled field description.
 *
 * Used internally by Fields.
 */
export const FieldDescription = (props: TextProps) => {
  return <StyledDescription {...props} />
}

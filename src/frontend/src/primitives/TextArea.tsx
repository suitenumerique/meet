import { TextArea as RACTextArea } from 'react-aria-components'
import { styled } from '@/styled-system/jsx'

/**
 * Styled RAC TextArea.
 */
export const TextArea = styled(RACTextArea, {
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
  variants: {
    placeholderStyle: {
      strong: {
        _placeholder: {
          color: 'black',
        },
      },
    },
    fieldSizing: {
      content: {
        fieldSizing: 'content',
      },
    },
  },
})

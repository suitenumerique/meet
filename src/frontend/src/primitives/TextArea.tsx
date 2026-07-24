import { TextArea as RACTextArea } from 'react-aria-components'
import { styled } from '@/styled-system/jsx'

/**
 * Styled RAC TextArea.
 */
export const TextArea = styled(RACTextArea, {
  base: {
    width: 'full',
    paddingY: 0.25,
    paddingX: 0.5,
    border: '1px solid',
    borderColor: 'control.border',
    color: 'control.text',
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

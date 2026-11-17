import { cva } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'

const box = cva({
  base: {
    position: 'relative',
    gap: 'gutter',
    borderRadius: 8,
    padding: 'boxPadding',
    flex: 1,
  },
  variants: {
    type: {
      screen: {
        margin: 'auto',
        width: '38rem',
        maxWidth: '100%',
        textAlign: 'center',
        borderColor: 'transparent',
        paddingY: 0,
      },
      popover: {
        padding: 'boxPadding.xs',
        minWidth: '10rem',
        boxShadow: '0 8px 20px #0000001a',
      },
      dialog: {
        width: '30rem',
        maxWidth: '100%',
      },
      alert: {
        width: '24rem',
        maxWidth: '100%',
      },
    },
    variant: {
      light: {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'border.surface.primary',
        backgroundColor: 'background.surface.primary',
        color: 'content.semantic.neutral.primary',
      },
      subtle: {
        color: 'content.semantic.neutral.secondary',
        backgroundColor: 'background.semantic.neutral.tertiary',
      },
      control: {
        border: '1px solid {colors.border.semantic.neutral.primary}',
        backgroundColor: 'background.surface.primary',
        color: 'content.semantic.neutral.primary',
      },
      dark: {
        backgroundColor: 'gray.900',
        borderColord: 'gray.900',
      },
    },
    size: {
      default: {
        padding: 'boxPadding',
      },
      sm: {
        padding: 'boxPadding.sm',
      },
    },
  },
  defaultVariants: {
    variant: 'light',
    size: 'default',
  },
})

export const Box = styled('div', box)

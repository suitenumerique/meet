import { sva } from '@/styled-system/css'

export const menuRecipe = sva({
  slots: ['root', 'item'],
  base: {
    root: {},
    item: {
      paddingY: '4xs',
      paddingX: 'xs',
      textAlign: 'left',
      width: 'full',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'content.semantic.neutral.primary',
      border: '1px solid transparent',
      position: 'relative',
      '&[data-selected]': {
        '&::before': {
          content: '"✓"',
          position: 'absolute',
          top: '2px',
          left: '6px',
        },
      },
      '&[data-focused]': {
        color: 'content.semantic.brand.on-brand',
        backgroundColor: 'gray.700',
      },
      '&[data-hovered]': {
        color: 'content.semantic.brand.on-brand',
        backgroundColor: 'gray.700',
      },
      '&[data-focus-visible]': {
        outline: '2px solid',
        outlineColor: 'focusRing',
        outlineOffset: '2px',
      },
    },
  },
  variants: {
    variant: {
      light: {
        item: {
          '&[data-focused]': {
            color: 'content.semantic.neutral.primary',
            backgroundColor: 'background.semantic.contextual.primary',
          },
          '&[data-hovered]': {
            color: 'content.semantic.neutral.primary',
            backgroundColor: 'background.semantic.contextual.primary',
          },
        },
      },
      dark: {
        item: {
          color: 'white',
          '&[data-focus-visible]': {
            outlineColor: 'white!',
            outlineOffset: '2px!',
          },
        },
      },
    },
    extraPadding: {
      true: {
        item: {
          paddingLeft: 'md',
        },
      },
    },
    icon: {
      true: {
        item: {
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          paddingY: '0.4rem',
        },
      },
    },
  },
  defaultVariants: {
    variant: 'light',
  },
})

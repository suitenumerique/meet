import { css, sva } from '@/styled-system/css'

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

/**
 * Container of a menu laid out as the DropdownMenu of the UI kit
 * (`.c__dropdown-menu` and `.c__dropdown-menu-item`): items go from one edge
 * to the other, with full-width separators.
 *
 * Meant for the Box of a popover, with a `data-theme` matching the variant of
 * the menu: tokens then resolve to their light or dark values. It restyles
 * the items it contains, whatever their `menuRecipe` variants.
 */
export const dropdownMenu = css({
  boxSizing: 'border-box',
  minWidth: '150px!',
  maxWidth: 'min(320px, calc(100vw - 32px))',
  padding: '0!',
  overflow: 'hidden',
  borderRadius: '8px!',
  border: '1px solid!',
  borderColor: 'border.surface.primary!',
  backgroundColor: 'background.surface.primary!',
  boxShadow: '0 0 6px 0 rgba(0, 0, 145, 0.1)!',
  '& [role=menu]': {
    overflow: 'auto',
    outline: 'none',
  },
  '& [role=separator]': {
    height: '1px',
    margin: 0,
    background: 'border.semantic.neutral.tertiary',
  },
  '& [role=menuitem]': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    border: 'none',
    borderBottom: '1px solid transparent',
    borderRadius: 0,
    color: 'content.semantic.neutral.primary',
    fontSize: '0.875rem',
    fontWeight: 500,
    lineHeight: '19px',
    // some items wrap their icon and label in a stack
    '& > div': {
      flex: 1,
      gap: '8px!',
    },
    '& svg': {
      flexShrink: 0,
      width: '24px',
      height: '24px',
      color: 'content.semantic.neutral.tertiary',
    },
    '&[data-focused], &[data-hovered]': {
      color: 'content.semantic.neutral.primary',
      backgroundColor: 'background.semantic.contextual.primary',
    },
    // The UI kit only shows the background. The ring is kept for keyboard
    // users, inside the item as it touches the edges of the menu.
    '&[data-focus-visible]': {
      outlineOffset: '-2px!',
    },
    '&[data-disabled]': {
      color: 'content.semantic.disabled.primary',
      cursor: 'not-allowed',
      backgroundColor: 'transparent',
    },
  },
})

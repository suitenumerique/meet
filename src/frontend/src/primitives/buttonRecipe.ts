import { type RecipeVariantProps, cva } from '@/styled-system/css'

export const buttonRecipe = cva({
  base: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'background 200ms, outline 200ms, border-color 200ms',
    cursor: 'pointer',
    border: '1px solid transparent',
    '&[data-disabled]': {
      cursor: 'default',
    },
    gap: '0.5rem',
  },
  variants: {
    size: {
      default: {
        borderRadius: 4,
        paddingX: 'base',
        paddingY: '0.625rem',
        '--square-padding': '0.625rem',
      },
      sm: {
        borderRadius: 4,
        paddingX: 'xs',
        paddingY: '3xs',
        '--square-padding': '{spacing.3xs}',
      },
      xs: {
        borderRadius: 4,
        '--square-padding': '0',
      },
      compact: {
        borderRadius: 4,
        paddingX: 'xs',
        paddingY: '0.625rem',
        '--square-padding': '0.625rem',
      },
    },
    square: {
      true: {
        paddingX: 'var(--square-padding)',
        paddingY: 'var(--square-padding)',
      },
    },
    round: {
      true: {
        borderRadius: '50%',
        paddingX: 'var(--square-padding)',
        paddingY: 'var(--square-padding)',
      },
    },
    variant: {
      primary: {
        backgroundColor: 'brand.550',
        color: 'white',
        fontWeight: 'medium !important',
        '&[data-hovered]': {
          backgroundColor: 'brand.650',
        },
        '&[data-pressed]': {
          backgroundColor: 'brand.650',
        },
        '&[data-disabled]': {
          backgroundColor: 'gray.050',
          color: 'gray.400',
        },
      },
      secondary: {
        backgroundColor: 'white',
        color: 'brand.550',
        fontWeight: 'medium !important',
        borderColor: 'brand.550',
        '&[data-hovered]': {
          backgroundColor: 'gray.050',
        },
        '&[data-pressed]': {
          backgroundColor: 'gray.050',
        },
      },
      secondaryText: {
        backgroundColor: 'transparent',
        fontWeight: 'medium !important',
        color: 'brand.550',
        '&[data-hovered]': {
          backgroundColor: 'gray.050',
        },
        '&[data-pressed]': {
          backgroundColor: 'gray.050',
        },
        '&[data-disabled]': {
          color: 'gray.400',
        },
      },
      whiteCircle: {
        color: 'white',
        border: '1px white solid',
        width: '56px',
        height: '56px',
        borderRadius: '100%',
        '&[data-hovered]': {
          backgroundColor: 'gray.050/20',
        },
        '&[data-pressed]': {
          backgroundColor: 'gray.050/50',
        },
      },
      bigSquare: {
        width: '56px',
        height: '56px',
        borderColor: 'gray.100',
        borderRadius: '4px',
        backgroundColor: 'gray.025',
        padding: '0',
        flexShrink: 0,
        '&[data-hovered]': {
          backgroundColor: 'gray.050',
        },
        transition: 'box-shadow 0.2s ease-in-out',
        '&[data-selected]': {
          boxShadow:
            '0 0 0 3px token(colors.brand.700) inset, 0 0 0 5px white inset',
        },
        '&[data-disabled]': {
          backgroundColor: 'gray.050',
          color: 'gray.400',
          opacity: '0.7',
        },
      },
      tertiary: {
        backgroundColor: 'brand.100',
        fontWeight: 'medium !important',
        // brand.550 is too light on these tinted backgrounds (4.1:1)
        color: 'brand.650',
        '&[data-hovered]': {
          backgroundColor: 'brand.150',
        },
        '&[data-pressed]': {
          backgroundColor: 'brand.150',
        },
        '&[data-disabled]': {
          backgroundColor: 'transparent',
          color: 'brand.400',
        },
      },
      tertiaryText: {
        backgroundColor: 'transparent',
        fontWeight: 'medium !important',
        color: 'brand.850',
        '&[data-hovered]': {
          backgroundColor: 'brand.150',
        },
        '&[data-pressed]': {
          backgroundColor: 'brand.150',
        },
      },
      primaryDark: {
        backgroundColor: 'gray.700',
        fontWeight: 'medium !important',
        color: 'white',
        '&[data-pressed]': {
          backgroundColor: 'gray.100',
          color: 'gray.700',
        },
        '&[data-disabled]': {
          backgroundColor: 'gray.850',
          color: 'gray.550',
        },
        '&[data-hovered]': {
          backgroundColor: 'gray.550',
          color: 'white',
        },
        '&[data-selected]': {
          backgroundColor: 'gray.250 !important',
          color: 'gray.700 !important',
        },
      },
      secondaryDark: {
        backgroundColor: 'gray.900',
        fontWeight: 'medium !important',
        color: 'white',
        '&[data-pressed]': {
          backgroundColor: 'gray.650',
        },
        '&[data-hovered]': {
          backgroundColor: 'gray.700',
          color: 'white',
        },
        '&[data-selected]': {
          backgroundColor: 'gray.250 !important',
          color: 'gray.700 !important',
        },
      },
      primaryTextDark: {
        backgroundColor: 'transparent',
        fontWeight: 'medium !important',
        color: 'white',
        '&[data-hovered]': {
          backgroundColor: 'gray.700',
        },
        '&[data-pressed]': {
          backgroundColor: 'gray.250',
          color: 'gray.700',
        },
        '&[data-selected]': {
          backgroundColor: 'gray.250',
          color: 'gray.700',
        },
        '&[data-focus-visible]': {
          outline: '2px solid',
          outlineColor: 'focusRing',
          outlineOffset: '2px',
        },
        '&[data-disabled]': {
          opacity: 0.2,
        },
      },
      quaternaryText: {
        backgroundColor: 'transparent',
        fontWeight: 'medium !important',
        color: 'gray.600',
        '&[data-hovered]': {
          backgroundColor: 'gray.050',
          color: 'gray.750',
        },
        '&[data-pressed]': {
          backgroundColor: 'gray.050',
          color: 'gray.750',
        },
        '&[data-disabled]': {
          backgroundColor: 'transparent',
          color: 'gray.150',
        },
      },
      greyscale: {
        backgroundColor: 'transparent',
        color: 'gray.400',
        '&[data-hovered]': {
          color: 'gray.850',
        },
        '&[data-pressed]': {
          color: 'gray.850',
        },
        '&[data-selected]': {
          color: 'gray.850',
        },
        '&[data-disabled]': {
          color: 'gray.100',
        },
      },
      danger: {
        backgroundColor: 'error.550',
        color: 'white',
        '&[data-hovered]': {
          backgroundColor: 'error.400',
        },
        '&[data-pressed]': {
          backgroundColor: 'error.300',
          color: 'error.700',
        },
      },
      error2: {
        backgroundColor: 'error.700',
        color: 'error.100',
        '&[data-hovered]': {
          backgroundColor: 'error.650',
        },
        '&[data-focused]': {
          backgroundColor: 'error.700',
        },
        '&[data-pressed]': {
          backgroundColor: 'error.100',
          color: 'error.900',
        },
        '&[data-selected]': {
          backgroundColor: 'error.100 !important',
          color: 'error.900 !important',
        },
        '&[data-disabled]': {
          backgroundColor: 'error.700 !important',
          // error.650 would leave the icon barely visible on error.700 (1.2:1)
          color: 'error.600 !important',
        },
      },
      errorCircle: {
        backgroundColor: 'error.500',
        width: '56px',
        height: '56px',
        borderRadius: '100%',
        color: 'white',
        '&[data-hovered]': {
          backgroundColor: 'error.400',
        },
        '&[data-pressed]': {
          backgroundColor: 'error.300',
          color: 'error.700',
        },
      },
      // @TODO: better handling of colors… this is a mess
      success: {
        color: 'content.semantic.success.secondary',
        backgroundColor: 'background.semantic.success.tertiary',
        '&[data-hovered]': {
          backgroundColor: 'background.semantic.success.tertiary-hover',
        },
        '&[data-pressed]': {
          backgroundColor: 'background.semantic.success.tertiary!',
        },
      },
      text: {
        color: 'content.semantic.brand.tertiary',
        '&[data-hovered]': {
          background: 'gray.050 !important',
          color: 'content.semantic.brand.tertiary !important',
        },
      },
      permission: {
        position: 'relative',
        borderRadius: '100%',
        color: 'warning.300',
        width: 'fit-content',
        height: 'fit-content',
        padding: '0 !important',
        margin: '0 !important',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    invisible: {
      true: {
        borderColor: 'none!',
        backgroundColor: 'none!',
        '&[data-hovered]': {
          backgroundColor: 'none!',
          borderColor: 'currentcolor!',
        },
        '&[data-pressed]': {
          borderColor: 'currentcolor',
        },
        '&[data-disabled]': {
          color: 'gray.150',
        },
      },
    },
    fullWidth: {
      true: {
        width: 'full',
      },
    },
    loading: {
      true: {},
    },
    // some toggle buttons make more sense without a "pushed button" style when selected because their content changes to mark the state
    shySelected: {
      true: {},
    },
    description: {
      true: {
        flexDirection: 'column',
        gap: '0.5rem',
        '& span': {
          fontSize: '13px',
          textAlign: 'center',
        },
      },
    },
    // if the button is next to other ones to make a "button group", tell where the button is to handle radius
    groupPosition: {
      left: {
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      },
      right: {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderLeft: 0,
      },
      center: {
        borderRadius: 0,
      },
    },
  },
  compoundVariants: [
    {
      variant: 'primaryDark',
      shySelected: true,
      css: {
        '&[data-selected]': {
          backgroundColor: 'gray.700',
          color: 'white',
        },
      },
    },
  ],
  defaultVariants: {
    size: 'default',
    variant: 'primary',
  },
})

export type ButtonRecipe = typeof buttonRecipe

export type ButtonRecipeProps = RecipeVariantProps<ButtonRecipe>

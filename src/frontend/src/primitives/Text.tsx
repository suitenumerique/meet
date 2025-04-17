/* eslint-disable react-refresh/only-export-components */

import type { HTMLAttributes } from 'react'
import { RecipeVariantProps, cva, cx } from '@/styled-system/css'

export const text = cva({
  base: {},
  variants: {
    variant: {
      h1: {
        textStyle: 'h1',
        marginBottom: 'heading',
        '&:not(:first-child)': {
          paddingTop: 'heading',
        },
      },
      h2: {
        textStyle: 'h2',
        marginBottom: 'heading',
        '&:not(:first-child)': {
          paddingTop: 'heading',
        },
      },
      h3: {
        textStyle: 'h3',
        marginBottom: 'heading',
        '&:not(:first-child)': {
          paddingTop: 'heading',
        },
      },
      subTitle: {
        fontSize: '1rem',
        color: 'greyscale.600',
      },
      bodyXsBold: {
        textStyle: 'body',
        fontWeight: 'bold',
      },
      body: {
        textStyle: 'body',
      },
      paragraph: {
        textStyle: 'body',
        marginBottom: 'paragraph',
      },
      display: {
        textStyle: 'display',
        marginBottom: 'heading',
      },
      sm: {
        textStyle: 'sm',
      },
      note: {
        color: 'default.subtle-text',
      },
      smNote: {
        color: 'default.subtle-text',
        textStyle: 'sm',
      },
      xsNote: {
        color: 'default.subtle-text',
        textStyle: 'xs',
      },
      inherits: {},
    },
    centered: {
      true: {
        textAlign: 'center',
      },
      false: {
        textAlign: 'inherit',
      },
    },
    wrap: {
      balance: {
        textWrap: 'balance',
      },
      pretty: {
        textWrap: 'pretty',
      },
    },
    bold: {
      true: {
        fontWeight: 'bold',
      },
      false: {
        fontWeight: 'normal',
      },
    },
    italic: {
      true: {
        fontStyle: 'italic',
      },
    },
    margin: {
      false: {
        margin: '0!',
      },
      sm: {
        marginBottom: 0.5,
      },
      md: {
        marginBottom: 1,
      },
    },
    fullWidth: {
      true: {
        width: '100%',
      },
    },
    last: {
      true: {
        marginBottom: '0!',
      },
    },
  },
  defaultVariants: {
    variant: 'inherits',
  },
})

type TextHTMLProps = HTMLAttributes<HTMLElement>
type TextElement =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'span'
  | 'strong'
  | 'em'
  | 'div'
export type As = { as?: TextElement }
export type TextProps = RecipeVariantProps<typeof text> & TextHTMLProps & As

export function Text(props: TextProps) {
  const [variantProps, componentProps] = text.splitVariantProps(props)
  const { as: Component = 'p', className, ...tagProps } = componentProps
  return (
    <Component className={cx(text(variantProps), className)} {...tagProps} />
  )
}

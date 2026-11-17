/* eslint-disable react-refresh/only-export-components */

import type { HTMLAttributes } from 'react'
import { type RecipeVariantProps, cva, cx } from '@/styled-system/css'

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
        color: 'gray.600',
      },
      bodyXsBold: {
        textStyle: 'body',
        fontWeight: 'bold',
      },
      bodyXsMedium: {
        textStyle: 'body',
        fontWeight: 'medium',
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
        color: 'content.semantic.neutral.secondary',
      },
      warning: {
        color: 'content.semantic.error.secondary',
      },
      smNote: {
        color: 'content.semantic.neutral.secondary',
        textStyle: 'sm',
      },
      xsNote: {
        color: 'content.semantic.neutral.secondary',
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
      no: {
        textWrap: 'nowrap',
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
        marginBottom: 'xs',
      },
      md: {
        marginBottom: 'base',
      },
    },
    padding: {
      false: {
        padding: '0!',
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

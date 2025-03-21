import { Link, type LinkProps } from 'react-aria-components'
import { cva, type RecipeVariantProps } from '@/styled-system/css'

const link = cva({
  base: {
    textDecoration: 'underline',
    textUnderlineOffset: '2',
    cursor: 'pointer',
    borderRadius: 2,
    transition: 'all 0.2s',
    '&[data-hovered]': {
      textDecorationThickness: '2px',
    },
    '&[data-pressed]': {
      textDecoration: 'underline',
    },
  },
  variants: {
    size: {
      sm: {
        textStyle: 'sm',
      },
    },
    externalIcon: {
      true: {
        _after: {
          content: 'url(/assets/link-grey.svg)',
          verticalAlign: 'middle',
          paddingLeft: '.25rem',
        },
      },
    },
    underline: {
      false: {
        textDecoration: 'none',
      },
    },
    footer: {
      important: {
        fontSize: '0.8rem',
        lineHeight: '1rem',
        fontWeight: '700',
        fontFamily: 'Marianne',
        textWrap: 'nowrap',
      },
      minor: {
        fontSize: '0.75rem',
        color: 'rgb(77 77 77)',
        fontFamily: 'Marianne',
        textWrap: 'nowrap',
        lineHeight: '1rem',
      },
    },
    color: {
      primary: {
        color: 'blue',
      },
    },
  },
})

export type AProps = LinkProps & RecipeVariantProps<typeof link>

/**
 * anchor component styled with underline. Used mostly for external links. Use Link for internal links
 */
export const A = ({
  size,
  externalIcon,
  underline,
  footer,
  color,
  ...props
}: AProps) => {
  return (
    <Link
      {...props}
      className={link({
        size,
        externalIcon,
        underline,
        footer,
        color,
      })}
    />
  )
}

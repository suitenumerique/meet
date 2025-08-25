import { css, cva, RecipeVariantProps } from '@/styled-system/css'
import React from 'react'

const avatar = cva({
  base: {
    backgroundColor: 'transparent',
    color: 'white',
    display: 'flex',
    borderRadius: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    userSelect: 'none',
    cursor: 'default',
    flexGrow: 0,
    flexShrink: 0,
  },
  variants: {
    context: {
      subtitles: {
        width: '40px',
        height: '40px',
        fontSize: '1.3rem',
        lineHeight: '1rem',
      },
      list: {
        width: '32px',
        height: '32px',
        fontSize: '1.3rem',
        lineHeight: '1rem',
      },
      placeholder: {
        width: '100%',
        height: '100%',
      },
    },
    notification: {
      true: {
        border: '2px solid white',
      },
    },
  },
  defaultVariants: {
    context: 'list',
  },
})

export type AvatarProps = React.HTMLAttributes<HTMLDivElement> & {
  name?: string
  bgColor?: string
} & RecipeVariantProps<typeof avatar>

export const Avatar = ({
  name,
  bgColor,
  context,
  notification,
  style,
  ...props
}: AvatarProps) => {
  const initial = name?.trim()?.charAt(0) ?? ''
  return (
    <div
      style={{
        backgroundColor: bgColor,
        ...style,
      }}
      className={avatar({ context, notification })}
      {...props}
    >
      <span
        className={css({
          marginTop: '-0.3rem',
        })}
      >
        {initial}
      </span>
    </div>
  )
}

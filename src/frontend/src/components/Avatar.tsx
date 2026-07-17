import { css, cva, RecipeVariantProps } from '@/styled-system/css'
import React from 'react'

const avatar = cva({
  base: {
    backgroundColor: 'transparent',
    color: 'white',
    display: 'flex',
    borderRadius: '50%',
    userSelect: 'none',
    cursor: 'default',
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  variants: {
    context: {
      subtitles: { width: '40px', height: '40px' },
      list: { width: '32px', height: '32px' },
      placeholder: { width: '100%', height: '100%' },
    },
    notification: {
      true: { border: '2px solid white' },
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

export const Avatar = React.memo(
  ({ name, bgColor, context, notification, style, ...props }: AvatarProps) => {
    const initial = name?.trim()?.charAt(0) ?? ''
    return (
      <div
        style={{ backgroundColor: bgColor, ...style }}
        className={avatar({ context, notification })}
        {...props}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className={css({ width: '100%', height: '100%', display: 'block' })}
        >
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="52"
            fontWeight="500"
            fill="currentColor"
          >
            {initial}
          </text>
        </svg>
      </div>
    )
  }
)

Avatar.displayName = 'Avatar'

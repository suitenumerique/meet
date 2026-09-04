import { css, cva, RecipeVariantProps } from '@/styled-system/css'
import React, { useMemo } from 'react'

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

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined

const getFirstGrapheme = (value: string): string => {
  if (!value) return ''
  if (graphemeSegmenter) {
    const [first] = graphemeSegmenter.segment(value)
    return first?.segment ?? ''
  }
  return Array.from(value)[0] ?? ''
}

const getInitials = (name?: string): string => {
  if (!name) return ''
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = getFirstGrapheme(words[0])
  const second = words.length > 1 ? getFirstGrapheme(words[1]) : ''
  return (first + second).toLocaleUpperCase()
}

export type AvatarProps = React.HTMLAttributes<HTMLDivElement> & {
  name?: string
  bgColor?: string
} & RecipeVariantProps<typeof avatar>

export const Avatar = React.memo(
  ({ name, bgColor, context, notification, style, ...props }: AvatarProps) => {
    const initials = useMemo(() => getInitials(name), [name])
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
            y={50}
            textAnchor="middle"
            fontSize="52"
            fontWeight="500"
            fill="currentColor"
            className={css({
              transform:
                'translateY(calc(var(--avatar-cap-height, 0.7) * 0.5em))',
            })}
          >
            {initials}
          </text>
        </svg>
      </div>
    )
  }
)

Avatar.displayName = 'Avatar'

import { css, cva, RecipeVariantProps } from '@/styled-system/css'
import React, { useLayoutEffect, useMemo } from 'react'

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

// Instantiating a segmenter is expensive; create it once and reuse it.
const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined

/**
 * Returns the first user-perceived character. Some Unicode characters span
 * multiple UTF-16 code units, so a naive index into the string can split them
 * and yield a broken glyph.
 */
const getFirstGrapheme = (value: string): string => {
  if (!value) return ''
  if (graphemeSegmenter) {
    const [first] = graphemeSegmenter.segment(value)
    return first?.segment ?? ''
  }
  // Fallback: keeps single code points intact (including surrogate pairs).
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
    const textRef = React.useRef<SVGTextElement>(null)
    const [offsetY, setOffsetY] = React.useState(0)

    // Optically center the initials: measure the ink bounding box of the
    // rendered glyphs and shift them so the box's center sits at the middle
    // of the viewBox. Works for any font, weight or glyph shape, unlike a
    // hand-tuned dy offset. getBBox() is in local (pre-transform)
    // coordinates, so applying the translation never changes the measure.
    useLayoutEffect(() => {
      const text = textRef.current
      if (!text) return

      const center = () => {
        const box = text.getBBox()
        // A hidden element measures as an empty box; keep the default then.
        if (box.height === 0) return
        setOffsetY(50 - (box.y + box.height / 2))
      }

      center()
      // Glyph metrics can change once webfonts finish loading.
      let cancelled = false
      document.fonts?.ready.then(() => {
        if (!cancelled) center()
      })
      return () => {
        cancelled = true
      }
    }, [initials])

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
            ref={textRef}
            x="50"
            y="50"
            transform={`translate(0 ${offsetY})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="52"
            fontWeight="500"
            fill="currentColor"
          >
            {initials}
          </text>
        </svg>
      </div>
    )
  }
)

Avatar.displayName = 'Avatar'

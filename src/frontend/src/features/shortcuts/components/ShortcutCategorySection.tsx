import React from 'react'
import { css } from '@/styled-system/css'
import { ShortcutDescriptor } from '../catalog'
import { Shortcut } from '../types'
import { useShortcutFormatting } from '../hooks/useShortcutFormatting'

type ShortcutCategorySectionProps = {
  category: string
  items: Array<{ item: ShortcutDescriptor; effective: Shortcut | undefined }>
  getCategoryLabel: (category: string) => string
  getActionLabel: (id: string) => string
}

const sectionStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  mb: '0.5rem',
})

const headingStyle = css({
  textTransform: 'capitalize',
  fontSize: '0.75rem',
  opacity: 0.8,
})

const listStyle = css({
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
})

const listItemStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
  alignItems: 'center',
  fontSize: '0.85rem',
})

const badgeStyle = css({
  fontFamily: 'monospace',
  backgroundColor: 'rgba(255,255,255,0.12)',
  paddingInline: '0.35rem',
  paddingBlock: '0.15rem',
  borderRadius: '6px',
  whiteSpace: 'nowrap',
})

export const ShortcutCategorySection: React.FC<
  ShortcutCategorySectionProps
> = ({ category, items, getCategoryLabel, getActionLabel }) => {
  const { formatVisual, formatForSR, getHoldTemplate } = useShortcutFormatting()

  return (
    <section className={sectionStyle}>
      <h3
        id={`shortcut-section-${category}`}
        data-shortcuts-heading
        tabIndex={-1}
        className={headingStyle}
      >
        {getCategoryLabel(category)}
      </h3>
      <ul
        aria-labelledby={`shortcut-section-${category}`}
        className={listStyle}
      >
        {items.map(({ item, effective }) => {
          const visualShortcut = formatVisual(
            effective,
            item.code,
            item.kind === 'longPress' && item.code
              ? getHoldTemplate('visual')
              : undefined
          )
          const srShortcut = formatForSR(effective, item.code)
          const actionLabel = getActionLabel(item.id)

          return (
            <li key={item.id} className={listItemStyle}>
              <span>
                {actionLabel}
                <span className="sr-only">, {srShortcut}</span>
              </span>
              <span aria-hidden className={badgeStyle}>
                {visualShortcut}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import React from 'react'
import { css } from '@/styled-system/css'
import { text } from '@/primitives/Text'
import { ShortcutDescriptor } from '../catalog'
import { ShortcutBadge } from './ShortcutBadge'
import { useShortcutFormatting } from '../hooks/useShortcutFormatting'

type ShortcutRowProps = {
  descriptor: ShortcutDescriptor
  actionLabel: string
}

const rowStyle = css({
  display: 'grid',
  gridTemplateColumns: '1.25fr auto',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.65rem 0',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
})

export const ShortcutRow: React.FC<ShortcutRowProps> = ({
  descriptor,
  actionLabel,
}) => {
  const { formatVisual, formatForSR, getHoldTemplate } = useShortcutFormatting({
    namespace: 'rooms',
  })

  const visualShortcut = formatVisual(
    descriptor.shortcut,
    descriptor.code,
    descriptor.kind === 'longPress' ? getHoldTemplate('visual') : undefined
  )
  const srShortcut = formatForSR(descriptor.shortcut, descriptor.code)

  return (
    <div role="listitem" className={rowStyle}>
      <div className={text({ variant: 'body' })}>{actionLabel}</div>
      <ShortcutBadge visualLabel={visualShortcut} srLabel={srShortcut} />
    </div>
  )
}

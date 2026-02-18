import React from 'react'
import { css } from '@/styled-system/css'
import { text } from '@/primitives/Text'
import { ShortcutDescriptor } from '../catalog'
import { ShortcutBadge } from './ShortcutBadge'
import { useShortcutFormatting } from '../hooks/useShortcutFormatting'
import { useTranslation } from 'react-i18next'

type ShortcutRowProps = {
  descriptor: ShortcutDescriptor
}

const rowStyle = css({
  display: 'grid',
  gridTemplateColumns: '1.25fr auto',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.65rem 0',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
})

export const ShortcutRow: React.FC<ShortcutRowProps> = ({ descriptor }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'shortcutsPanel' })
  const { formatVisual, formatForSR } = useShortcutFormatting()

  const visualShortcut = formatVisual(
    descriptor.shortcut,
    descriptor.code,
    descriptor.kind
  )
  const srShortcut = formatForSR(descriptor.shortcut, descriptor.code)

  return (
    <div role="listitem" className={rowStyle}>
      <div className={text({ variant: 'body' })}>
        {t(`actions.${descriptor.id}`)}
      </div>
      <ShortcutBadge visualLabel={visualShortcut} srLabel={srShortcut} />
    </div>
  )
}

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

const shortcutCellStyle = css({
  textAlign: 'right',
})

export const ShortcutRow: React.FC<ShortcutRowProps> = ({ descriptor }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'shortcutsPanel' })
  const { formatVisual, formatForSR } = useShortcutFormatting()

  const visualShortcut = formatVisual(
    descriptor.shortcut,
    descriptor.code,
    descriptor.kind
  )
  const srShortcut = formatForSR(
    descriptor.shortcut,
    descriptor.code,
    descriptor.kind
  )

  return (
    <tr>
      <td className={text({ variant: 'body' })}>
        {t(`actions.${descriptor.id}`)}
      </td>
      <td className={shortcutCellStyle}>
        <ShortcutBadge visualLabel={visualShortcut} srLabel={srShortcut} />
      </td>
    </tr>
  )
}

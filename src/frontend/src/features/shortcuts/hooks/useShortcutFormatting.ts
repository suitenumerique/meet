import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Shortcut } from '../types'
import {
  formatShortcutLabel,
  formatShortcutLabelForSR,
  formatLongPressLabel,
  getKeyLabelFromCode,
} from '../formatLabels'

export const useShortcutFormatting = () => {
  const { t } = useTranslation('rooms')

  const formatVisual = useCallback(
    (shortcut?: Shortcut, code?: string, kind?: string) => {
      if (code && kind === 'longPress') {
        const label = getKeyLabelFromCode(code)
        return formatLongPressLabel(
          label,
          t('shortcutsPanel.visual.hold', { key: '{{key}}' })
        )
      }
      return formatShortcutLabel(shortcut)
    },
    [t]
  )

  const formatForSR = useCallback(
    (shortcut?: Shortcut, code?: string, kind?: string) => {
      if (code && kind === 'longPress') {
        const label = getKeyLabelFromCode(code)
        return formatLongPressLabel(
          label,
          t('shortcutsPanel.sr.hold', { key: '{{key}}' })
        )
      }
      return formatShortcutLabelForSR(shortcut, {
        controlLabel: t('shortcutsPanel.sr.control'),
        commandLabel: t('shortcutsPanel.sr.command'),
        plusLabel: t('shortcutsPanel.sr.plus'),
        noShortcutLabel: t('shortcutsPanel.sr.noShortcut'),
      })
    },
    [t]
  )

  return {
    formatVisual,
    formatForSR,
  }
}

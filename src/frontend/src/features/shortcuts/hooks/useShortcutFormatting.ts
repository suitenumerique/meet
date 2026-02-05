import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Shortcut } from '../types'
import {
  formatShortcutLabel,
  formatShortcutLabelForSR,
  formatLongPressLabel,
  getKeyLabelFromCode,
} from '../formatLabels'

type UseShortcutFormattingOptions = {
  namespace?: string
}

export const useShortcutFormatting = (
  options: UseShortcutFormattingOptions = {}
) => {
  const { namespace = 'rooms' } = options
  const { t } = useTranslation(namespace)

  const formatVisual = useCallback(
    (shortcut?: Shortcut, code?: string, holdTemplate?: string) => {
      if (code && holdTemplate) {
        const label = getKeyLabelFromCode(code)
        return formatLongPressLabel(label, holdTemplate)
      }
      return formatShortcutLabel(shortcut)
    },
    []
  )

  const formatForSR = useCallback(
    (shortcut?: Shortcut, code?: string) => {
      if (code) {
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

  const getHoldTemplate = useCallback(
    (type: 'visual' | 'sr' = 'visual') => {
      return t(`shortcutsPanel.${type}.hold`, { key: '{{key}}' })
    },
    [t]
  )

  return {
    formatVisual,
    formatForSR,
    getHoldTemplate,
  }
}

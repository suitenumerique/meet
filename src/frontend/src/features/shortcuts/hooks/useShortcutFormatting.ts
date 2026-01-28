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
    (
      shortcut?: Shortcut,
      code?: string,
      getHoldLabel?: (code: string) => string
    ) => {
      if (code && getHoldLabel) {
        return getHoldLabel(code)
      }
      return formatShortcutLabel(shortcut)
    },
    []
  )

  const formatForSR = useCallback(
    (shortcut?: Shortcut, code?: string) => {
      if (code) {
        const template = t('shortcutsPanel.sr.hold', { key: '{{key}}' })
        const label = getKeyLabelFromCode(code)
        return formatLongPressLabel(label, template)
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
      const template = t(`shortcutsPanel.${type}.hold`, { key: '{{key}}' })
      return (code: string) => {
        const label = getKeyLabelFromCode(code)
        return formatLongPressLabel(label, template)
      }
    },
    [t]
  )

  return {
    formatVisual,
    formatForSR,
    getHoldTemplate,
  }
}

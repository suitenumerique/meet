import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Shortcut } from '../types'
import {
  formatShortcutLabel,
  formatShortcutLabelForSR,
  getKeyLabelFromCode,
} from '../formatLabels'

export const useShortcutFormatting = () => {
  const { t } = useTranslation('rooms')

  const formatVisual = useCallback(
    (shortcut?: Shortcut, code?: string, kind?: string) => {
      if (kind === 'arrows') {
        return t('shortcutsPanel.visual.arrows')
      }
      if (code && kind === 'longPress') {
        const label = getKeyLabelFromCode(code)
        return t('shortcutsPanel.visual.hold', { key: label || '?' })
      }
      return formatShortcutLabel(shortcut)
    },
    [t]
  )

  const formatForSR = useCallback(
    (shortcut?: Shortcut, code?: string, kind?: string) => {
      if (kind === 'arrows') {
        return t('shortcutsPanel.sr.arrows')
      }
      if (code && kind === 'longPress') {
        const label = getKeyLabelFromCode(code)
        return t('shortcutsPanel.sr.hold', { key: label || '?' })
      }
      return formatShortcutLabelForSR(shortcut, {
        controlLabel: t('shortcutsPanel.sr.control'),
        commandLabel: t('shortcutsPanel.sr.command'),
        altLabel: t('shortcutsPanel.sr.alt'),
        optionLabel: t('shortcutsPanel.sr.option'),
        shiftLabel: t('shortcutsPanel.sr.shift'),
        plusLabel: t('shortcutsPanel.sr.plus'),
        noShortcutLabel: t('shortcutsPanel.sr.noShortcut'),
        keyLabels: {
          '+': t('shortcutsPanel.sr.plusKey'),
          '-': t('shortcutsPanel.sr.minusKey'),
        },
      })
    },
    [t]
  )

  return {
    formatVisual,
    formatForSR,
  }
}

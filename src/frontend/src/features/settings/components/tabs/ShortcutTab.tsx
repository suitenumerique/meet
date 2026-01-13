import React, { useCallback, useMemo, useState } from 'react'
import { Shortcut } from '@/features/shortcuts/types'
import { shortcutCatalog } from '@/features/shortcuts/catalog'
import {
  formatLongPressLabel,
  formatShortcutLabel,
  formatShortcutLabelForSR,
  getKeyLabelFromCode,
} from '@/features/shortcuts/formatLabels'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { text } from '@/primitives/Text'
import { buttonRecipe } from '@/primitives/buttonRecipe'
import { TabPanel, type TabPanelProps } from '@/primitives/Tabs'
import { useSnapshot } from 'valtio'
import {
  loadShortcutOverrides,
  removeOverride,
  setOverride,
  shortcutOverridesStore,
} from '@/stores/shortcutOverrides'

const rowStyle = css({
  display: 'grid',
  gridTemplateColumns: '1.25fr auto auto',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.65rem 0',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
})

const badgeStyle = css({
  fontFamily: 'monospace',
  backgroundColor: 'rgba(255,255,255,0.12)',
  paddingInline: '0.4rem',
  paddingBlock: '0.2rem',
  borderRadius: '6px',
  whiteSpace: 'nowrap',
  minWidth: '5.5rem',
  textAlign: 'center',
})

const buttonLink = buttonRecipe({ variant: 'secondary', size: 'sm' })

const ShortcutTab = ({ id }: Pick<TabPanelProps, 'id'>) => {
  const { t } = useTranslation(['settings', 'rooms'])
  const tRooms = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'rooms', ...options }),
    [t]
  )
  loadShortcutOverrides()
  const { overrides } = useSnapshot(shortcutOverridesStore)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmationMessage, setConfirmationMessage] = useState<string>('')

  const handleStartEdit = useCallback((shortcutId: string) => {
    setEditingId(shortcutId)
  }, [])

  const handleReset = useCallback(
    (shortcutId: string) => {
      removeOverride(shortcutId)
      setConfirmationMessage(
        t('shortcutsEditor.resetConfirmation', {
          defaultValue: 'Shortcut reset',
        })
      )
      setTimeout(() => setConfirmationMessage(''), 3000)
    },
    [t]
  )

  const handleKeyCapture = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, shortcutId: string) => {
      e.preventDefault()
      const { key, ctrlKey, shiftKey, altKey } = e
      // Ignore modifier-only keys
      if (
        !key ||
        key === 'Control' ||
        key === 'Meta' ||
        key === 'Shift' ||
        key === 'Alt' ||
        key === 'Tab'
      )
        return
      const normalized: Shortcut = {
        key,
        ctrlKey,
        shiftKey,
        altKey,
      }
      setOverride(shortcutId, normalized)
      setEditingId(null)
      setConfirmationMessage(
        t('shortcutsEditor.modifiedConfirmation', {
          defaultValue: 'Shortcut modified',
        })
      )
      setTimeout(() => setConfirmationMessage(''), 3000)
    },
    [t]
  )

  const handleEditButtonKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, shortcutId: string) => {
      // If already in edit mode, capture the key
      if (editingId === shortcutId) {
        handleKeyCapture(e, shortcutId)
        return
      }
      // Otherwise, if it's Enter or Space, start edit mode (like a click)
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleStartEdit(shortcutId)
      }
    },
    [editingId, handleKeyCapture, handleStartEdit]
  )

  const rows = useMemo(() => {
    return shortcutCatalog.map((item) => {
      const override = overrides.get(item.id)
      const effectiveShortcut = override ?? item.shortcut
      const visualShortcut =
        item.kind === 'longPress'
          ? formatLongPressLabel(
              getKeyLabelFromCode(item.code),
              tRooms('shortcutsPanel.visual.hold', { key: '{{key}}' })
            )
          : formatShortcutLabel(effectiveShortcut)
      const srShortcut =
        item.kind === 'longPress'
          ? formatLongPressLabel(
              getKeyLabelFromCode(item.code),
              tRooms('shortcutsPanel.sr.hold', { key: '{{key}}' })
            )
          : formatShortcutLabelForSR(effectiveShortcut, {
              controlLabel: tRooms('shortcutsPanel.sr.control'),
              commandLabel: tRooms('shortcutsPanel.sr.command'),
              plusLabel: tRooms('shortcutsPanel.sr.plus'),
              noShortcutLabel: tRooms('shortcutsPanel.sr.noShortcut'),
            })
      return {
        item,
        override,
        visualShortcut,
        srShortcut,
      }
    })
  }, [overrides, tRooms])

  return (
    <TabPanel
      id={id}
      padding="md"
      flex
      className={css({
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      })}
    >
      <div className={text({ variant: 'h2' })}>{t('tabs.shortcuts')}</div>
      <div className={text({ variant: 'body' })}>
        {t('shortcutsEditor.description')}
      </div>
      {confirmationMessage && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={text({ variant: 'smNote' })}
        >
          {confirmationMessage}
        </div>
      )}
      <div
        role="list"
        aria-label={t('shortcutsEditor.listLabel', {
          defaultValue: 'List of keyboard shortcuts',
        })}
        className={css({
          display: 'grid',
          gap: '0.25rem',
          maxHeight: '420px',
          overflowY: 'auto',
          paddingRight: '0.35rem',
        })}
      >
        {rows.map(({ item, override, visualShortcut, srShortcut }) => {
          const actionLabel = tRooms(`shortcutsPanel.actions.${item.id}`)
          const editButtonLabel =
            editingId === item.id
              ? t('shortcutsEditor.capture')
              : t('shortcutsEditor.edit')
          const editButtonAriaLabel =
            editingId === item.id
              ? t('shortcutsEditor.captureAria', {
                  defaultValue: 'Press keys to set shortcut for {{action}}',
                  action: actionLabel,
                })
              : t('shortcutsEditor.editAria', {
                  defaultValue: 'Edit shortcut for {{action}}',
                  action: actionLabel,
                })
          const resetButtonAriaLabel = t('shortcutsEditor.resetAria', {
            defaultValue: 'Reset shortcut for {{action}}',
            action: actionLabel,
          })

          return (
            <div key={item.id} role="listitem" className={rowStyle}>
              <div>
                <div className={text({ variant: 'body' })}>{actionLabel}</div>
              </div>
              <div
                aria-label={t('shortcutsEditor.shortcutAria', {
                  defaultValue: 'Shortcut for {{action}}: {{shortcut}}',
                  action: actionLabel,
                  shortcut: srShortcut,
                })}
                className={badgeStyle}
              >
                <span aria-hidden="true">{visualShortcut}</span>
                {override && (
                  <span
                    className={text({ variant: 'smNote' })}
                    style={{ marginLeft: '0.4rem' }}
                    aria-label={t('shortcutsEditor.customAria', {
                      defaultValue: 'custom',
                    })}
                  >
                    <span aria-hidden="true">
                      ({t('shortcutsEditor.custom')})
                    </span>
                  </span>
                )}
              </div>
              <div
                role="group"
                aria-label={t('shortcutsEditor.actionsGroupAria', {
                  defaultValue: 'Actions for {{action}}',
                  action: actionLabel,
                })}
                className={css({
                  display: 'flex',
                  gap: '0.35rem',
                  justifyContent: 'flex-end',
                })}
              >
                <button
                  type="button"
                  className={buttonLink}
                  onKeyDown={(e) => handleEditButtonKeyDown(e, item.id)}
                  onClick={() => handleStartEdit(item.id)}
                  aria-pressed={editingId === item.id}
                  aria-label={editButtonAriaLabel}
                  aria-describedby={`shortcut-${item.id}-description`}
                >
                  {editButtonLabel}
                </button>
                <button
                  type="button"
                  className={buttonLink}
                  onClick={() => handleReset(item.id)}
                  aria-disabled={!override}
                  disabled={!override}
                  aria-label={resetButtonAriaLabel}
                  aria-describedby={`shortcut-${item.id}-description`}
                  style={{ opacity: !override ? 0.5 : 1 }}
                >
                  {t('shortcutsEditor.reset')}
                </button>
                <span
                  id={`shortcut-${item.id}-description`}
                  className="sr-only"
                >
                  {t('shortcutsEditor.currentShortcut', {
                    defaultValue: 'Current shortcut: {{shortcut}}',
                    shortcut: srShortcut,
                  })}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div className={text({ variant: 'smNote' })}>
        {t('shortcutsEditor.limitations')}
      </div>
    </TabPanel>
  )
}

export default ShortcutTab

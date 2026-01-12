import React, { useCallback, useEffect, useMemo, useState } from 'react'
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

type ShortcutOverrides = Record<string, Shortcut>

const STORAGE_KEY = 'shortcuts:overrides'

const loadOverrides = (): ShortcutOverrides => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ShortcutOverrides
  } catch (e) {
    console.warn('Failed to parse shortcut overrides', e)
    return {}
  }
}

const saveOverrides = (overrides: ShortcutOverrides) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

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
  const [overrides, setOverrides] = useState<ShortcutOverrides>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    setOverrides(loadOverrides())
  }, [])

  const handleStartEdit = useCallback((shortcutId: string) => {
    setEditingId(shortcutId)
  }, [])

  const handleReset = useCallback(
    (shortcutId: string) => {
      const next = { ...overrides }
      delete next[shortcutId]
      setOverrides(next)
      saveOverrides(next)
    },
    [overrides]
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
        key === 'Alt'
      )
        return
      const normalized: Shortcut = {
        key,
        ctrlKey,
        shiftKey,
        altKey,
      }
      const next = { ...overrides, [shortcutId]: normalized }
      setOverrides(next)
      saveOverrides(next)
      setEditingId(null)
    },
    [overrides]
  )

  const rows = useMemo(() => {
    return shortcutCatalog.map((item) => {
      const override = overrides[item.id]
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
      <div
        className={css({
          display: 'grid',
          gap: '0.25rem',
          maxHeight: '420px',
          overflowY: 'auto',
          paddingRight: '0.35rem',
        })}
      >
        {rows.map(({ item, override, visualShortcut, srShortcut }) => (
          <div key={item.id} className={rowStyle}>
            <div>
              <div className={text({ variant: 'body' })}>
                {tRooms(`shortcutsPanel.actions.${item.id}`)}
              </div>
            </div>
            <div aria-label={srShortcut} className={badgeStyle}>
              {visualShortcut}
              {override && (
                <span
                  className={text({ variant: 'smNote' })}
                  style={{ marginLeft: '0.4rem' }}
                >
                  ({t('shortcutsEditor.custom')})
                </span>
              )}
            </div>
            <div
              className={css({
                display: 'flex',
                gap: '0.35rem',
                justifyContent: 'flex-end',
              })}
            >
              <button
                type="button"
                className={buttonLink}
                onKeyDown={(e) => handleKeyCapture(e, item.id)}
                onClick={() => handleStartEdit(item.id)}
                aria-pressed={editingId === item.id}
              >
                {editingId === item.id
                  ? t('shortcutsEditor.capture')
                  : t('shortcutsEditor.edit')}
              </button>
              <button
                type="button"
                className={buttonLink}
                onClick={() => handleReset(item.id)}
                disabled={!override}
              >
                {t('shortcutsEditor.reset')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className={text({ variant: 'smNote' })}>
        {t('shortcutsEditor.limitations')}
      </div>
    </TabPanel>
  )
}

export default ShortcutTab

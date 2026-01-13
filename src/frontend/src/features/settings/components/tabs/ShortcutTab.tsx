import { useCallback, useEffect, useMemo } from 'react'
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
import { TabPanel, type TabPanelProps } from '@/primitives/Tabs'
import { useSnapshot } from 'valtio'
import {
  loadShortcutOverrides,
  shortcutOverridesStore,
} from '@/stores/shortcutOverrides'
// Edit and reset feature, uncomment when ready to use
// import { ShortcutEditActions } from './ShortcutEditActions'
// import { useShortcutConfirmation } from './useShortcutConfirmation.tsx'

const rowStyle = css({
  display: 'grid',
  // Edit and reset feature: uncomment 'auto auto' when ShortcutEditActions is used
  gridTemplateColumns: '1.25fr auto', // '1.25fr auto auto' when ShortcutEditActions is used
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

const ShortcutTab = ({ id }: Pick<TabPanelProps, 'id'>) => {
  const { t } = useTranslation(['settings', 'rooms'])
  const tRooms = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'rooms', ...options }),
    [t]
  )
  useEffect(() => {
    loadShortcutOverrides()
  }, [])
  const { overrides } = useSnapshot(shortcutOverridesStore)

  // Edit and reset feature, uncomment when ready to use
  // const { setConfirmationMessage, ConfirmationMessage } = useShortcutConfirmation()

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
      {/* Edit and reset feature, uncomment when ready to use */}
      {/* <ConfirmationMessage /> */}
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
          const srCustomLabel = override
            ? t('shortcutsEditor.customAria', {
                defaultValue: 'custom',
              })
            : ''

          return (
            <div key={item.id} role="listitem" className={rowStyle}>
              <div>
                <div className={text({ variant: 'body' })}>{actionLabel}</div>
              </div>
              <div className={badgeStyle} aria-hidden="true">
                <span aria-hidden="true">{visualShortcut}</span>
                {override && (
                  <span
                    className={text({ variant: 'smNote' })}
                    style={{ marginLeft: '0.4rem' }}
                    aria-hidden="true"
                  >
                    <span aria-hidden="true">
                      ({t('shortcutsEditor.custom')})
                    </span>
                  </span>
                )}
              </div>
              <span className="sr-only">
                {srShortcut}
                {srCustomLabel ? ` (${srCustomLabel})` : ''}
              </span>
              {/* Edit and reset feature, uncomment when ready to use */}
              {/* <ShortcutEditActions
                shortcutId={item.id}
                actionLabel={actionLabel}
                srShortcut={srShortcut}
                hasOverride={!!override}
                onConfirmationChange={setConfirmationMessage}
              /> */}
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

import { useCallback, useEffect, useMemo } from 'react'
import { shortcutCatalog } from '@/features/shortcuts/catalog'
import { ShortcutRow } from '@/features/shortcuts/components'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { text } from '@/primitives/Text'
import { TabPanel, type TabPanelProps } from '@/primitives/Tabs'
import { useSnapshot } from 'valtio'
import {
  loadShortcutOverrides,
  shortcutOverridesStore,
} from '@/stores/shortcutOverrides'

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

  const rows = useMemo(() => {
    return shortcutCatalog.map((item) => {
      const override = overrides.get(item.id)
      const effectiveShortcut = override ?? item.shortcut
      return {
        item,
        override,
        effectiveShortcut,
      }
    })
  }, [overrides])

  return (
    <TabPanel
      id={id}
      padding="md"
      flex
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      })}
    >
      <div className={text({ variant: 'h2' })}>{t('tabs.shortcuts')}</div>
      <div
        role="list"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={t('shortcutsEditor.listLabel', {
          defaultValue: 'List of keyboard shortcuts',
        })}
        className={css({
          display: 'grid',
          gap: '0.25rem',
          maxHeight: '420px',
          overflowY: 'auto',
          paddingRight: '0.35rem',
          outline: 'none',
          '&:focus-visible': {
            outline: '2px solid rgba(255,255,255,0.5)',
            outlineOffset: '2px',
            borderRadius: '6px',
          },
        })}
      >
        {rows.map(({ item, override, effectiveShortcut }) => (
          <ShortcutRow
            key={item.id}
            descriptor={item}
            effectiveShortcut={effectiveShortcut}
            override={override}
            actionLabel={tRooms(`shortcutsPanel.actions.${item.id}`)}
            customLabel={t('shortcutsEditor.custom')}
          />
        ))}
      </div>
    </TabPanel>
  )
}

export default ShortcutTab

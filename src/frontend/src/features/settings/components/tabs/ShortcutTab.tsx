import { shortcutCatalog } from '@/features/shortcuts/catalog'
import { ShortcutRow } from '@/features/shortcuts/components/ShortcutRow'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { TabPanel, type TabPanelProps } from '@/primitives/Tabs'
import { H } from '@/primitives'

const tableStyle = css({
  width: '100%',
  borderCollapse: 'collapse',
  overflowY: 'auto',
  '& th, & td': {
    padding: '0.65rem 0',
    textAlign: 'left',
  },
  '& tbody tr': {
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
})

export const ShortcutTab = ({ id }: Pick<TabPanelProps, 'id'>) => {
  const { t } = useTranslation(['settings', 'rooms'])

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
      <H lvl={2}>{t('shortcuts.listLabel')}</H>
      <table className={tableStyle}>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('shortcuts.columnAction')}</th>
            <th scope="col">{t('shortcuts.columnShortcut')}</th>
          </tr>
        </thead>
        <tbody>
          {shortcutCatalog.map((item) => (
            <ShortcutRow key={item?.id} descriptor={item} />
          ))}
        </tbody>
      </table>
    </TabPanel>
  )
}

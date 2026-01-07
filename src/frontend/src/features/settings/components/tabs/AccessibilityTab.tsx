import { Field, H } from '@/primitives'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

export type AccessibilityTabProps = Pick<TabPanelProps, 'id'>

export const AccessibilityTab = ({ id }: AccessibilityTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'tabs' })

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('accessibility')}</H>
      <ul
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        })}
      >
        <li>
          <Field type="switch" label={t('accessibility.label')} />
        </li>
      </ul>
    </TabPanel>
  )
}

export default AccessibilityTab

import { Field, H } from '@/primitives'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { accessibilityStore } from '@/stores/accessibility'

export type AccessibilityTabProps = Pick<TabPanelProps, 'id'>

export const AccessibilityTab = ({ id }: AccessibilityTabProps) => {
  const { t } = useTranslation('settings')
  const snap = useSnapshot(accessibilityStore)

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('tabs.accessibility')}</H>
      <ul
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        })}
      >
        <li>
          <Field
            type="switch"
            label={t('accessibility.announceReactions.label')}
            isSelected={snap.announceReactions}
            onChange={(value) => {
              accessibilityStore.announceReactions = value
            }}
            wrapperProps={{ noMargin: true, fullWidth: true }}
          />
        </li>
      </ul>
    </TabPanel>
  )
}

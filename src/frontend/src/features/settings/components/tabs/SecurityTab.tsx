/**
 * Security settings tab — user-level encryption preferences only. The
 * per-meeting pause control lives in the Admin panel (room moderation),
 * since it's a moderation action, not a user preference.
 */
import { useTranslation } from 'react-i18next'
import { H } from '@/primitives'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { EncryptionDefaultField } from '../EncryptionDefaultField'

export type SecurityTabProps = Pick<TabPanelProps, 'id'>

export const SecurityTab = ({ id }: SecurityTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  return (
    <TabPanel padding="md" flex id={id}>
      <H lvl={2}>{t('heading')}</H>
      <EncryptionDefaultField />
    </TabPanel>
  )
}

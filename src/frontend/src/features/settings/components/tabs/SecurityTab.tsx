import { useTranslation } from 'react-i18next'
import { H, Text } from '@/primitives'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { EncryptionDefaultField } from '../EncryptionDefaultField'

export type SecurityTabProps = Pick<TabPanelProps, 'id'>

export const SecurityTab = ({ id }: SecurityTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  return (
    <TabPanel padding="md" flex id={id}>
      <H lvl={2} margin={false}>
        {t('heading')}
      </H>
      <Text variant="note" margin="md">
        {t('subtitle')}
      </Text>
      <EncryptionDefaultField />
    </TabPanel>
  )
}

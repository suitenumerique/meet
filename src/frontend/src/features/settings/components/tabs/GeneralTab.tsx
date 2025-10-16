import { Field, H } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useLanguageLabels } from '@/i18n/useLanguageLabels'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { userPreferencesStore } from '@/stores/userPreferences'
import { useSnapshot } from 'valtio'

export type GeneralTabProps = Pick<TabPanelProps, 'id'>

export const GeneralTab = ({ id }: GeneralTabProps) => {
  const { t, i18n } = useTranslation('settings')
  const { languagesList, currentLanguage } = useLanguageLabels()

  const userPreferencesSnap = useSnapshot(userPreferencesStore)

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('language.heading')}</H>
      <Field
        type="select"
        label={t('language.label')}
        items={languagesList}
        defaultSelectedKey={currentLanguage.key}
        onSelectionChange={(lang) => {
          i18n.changeLanguage(lang as string)
        }}
      />
      <H lvl={2}>{t('preferences.title')}</H>
      <Field
        type="switch"
        label={t('preferences.idleDisconnectModal.label')}
        description={t('preferences.idleDisconnectModal.description')}
        isSelected={userPreferencesSnap.is_idle_disconnect_modal_enabled}
        onChange={(value) =>
          (userPreferencesStore.is_idle_disconnect_modal_enabled = value)
        }
        wrapperProps={{
          noMargin: true,
          fullWidth: true,
        }}
      />
    </TabPanel>
  )
}

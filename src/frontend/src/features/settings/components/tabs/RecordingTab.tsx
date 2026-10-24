import { TabPanel, type TabPanelProps } from '@/primitives/Tabs'
import { Field, H, Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import {
  DEFAULT_ENCODING_OPTION,
  useIsRecordingLocked,
  useRecordingEncoding,
} from '@/features/recording'

export type RecordingTabProps = Pick<TabPanelProps, 'id'>

export const RecordingTab = ({ id }: RecordingTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'recording' })

  const {
    availableResolutions,
    availableProfiles,
    hasDefaultResolution,
    hasDefaultProfile,
    resolution,
    profile,
    setResolution,
    setProfile,
  } = useRecordingEncoding()

  const isLocked = useIsRecordingLocked()

  // The API requires a resolution to modify the encoding: with a "Default"
  // resolution no payload is sent, so the profile cannot apply. Show it as
  // "Default" and disabled until a resolution is chosen.
  const isResolutionDefault = resolution === DEFAULT_ENCODING_OPTION
  const selectedProfile = isResolutionDefault ? '' : profile

  const defaultItem = {
    value: DEFAULT_ENCODING_OPTION,
    label: t('defaultOption'),
  }

  // Resolutions and profiles are operator-defined: fall back to the raw key
  // when no translation exists for a custom value.
  const resolutionItems = useMemo(
    () => [
      ...(hasDefaultResolution ? [] : [defaultItem]),
      ...availableResolutions.map((key) => ({
        value: key,
        label: t(`resolution.options.${key}`, { defaultValue: key }),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasDefaultResolution, availableResolutions, t]
  )

  const profileItems = useMemo(
    () => [
      ...(hasDefaultProfile ? [] : [defaultItem]),
      ...availableProfiles.map((key) => ({
        value: key,
        label: t(`profile.options.${key}.label`, { defaultValue: key }),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasDefaultProfile, availableProfiles, t]
  )

  const profileDescription = selectedProfile
    ? t(`profile.options.${selectedProfile}.description`, { defaultValue: '' })
    : ''

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('heading')}</H>
      {isLocked && (
        <Text variant="note" role="status" margin="sm">
          {t('locked')}
        </Text>
      )}
      <Field
        type="select"
        label={t('resolution.label')}
        description={t('resolution.description')}
        items={resolutionItems}
        selectedKey={resolution ?? null}
        isDisabled={isLocked}
        onSelectionChange={(key) => {
          if (isLocked || key === null) return
          setResolution(String(key))
        }}
      />
      <Field
        type="select"
        label={t('profile.label')}
        description={profileDescription || undefined}
        items={profileItems}
        selectedKey={selectedProfile ?? null}
        isDisabled={isLocked || isResolutionDefault}
        onSelectionChange={(key) => {
          if (isLocked || isResolutionDefault || key === null) return
          setProfile(String(key))
        }}
      />
    </TabPanel>
  )
}

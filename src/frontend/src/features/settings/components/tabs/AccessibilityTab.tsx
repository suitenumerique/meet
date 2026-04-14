import { Field, H, Text } from '@/primitives'
import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { css } from '@/styled-system/css'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import {
  accessibilityStore,
  UI_FONT_OPTIONS,
  type UiFont,
} from '@/stores/accessibility'
import { CaptionsSettings } from '@/features/subtitle/component/CaptionsSettings'

export type AccessibilityTabProps = Pick<TabPanelProps, 'id'>

export const AccessibilityTab = ({ id }: AccessibilityTabProps) => {
  const { t } = useTranslation('settings')
  const snap = useSnapshot(accessibilityStore)

  const fontItems = useMemo(
    () =>
      UI_FONT_OPTIONS.map((font) => ({
        value: font,
        label: t(`accessibility.font.options.${font}`),
      })),
    [t]
  )

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
        <li>
          <Field
            type="select"
            label={t('accessibility.font.label')}
            items={fontItems}
            selectedKey={snap.uiFont}
            onSelectionChange={(key) => {
              accessibilityStore.uiFont = key as UiFont
            }}
            wrapperProps={{ noMargin: true, fullWidth: true }}
          />
          <Text variant="smNote" className={css({ marginTop: '0.25rem' })}>
            {t('accessibility.font.description')}
          </Text>
        </li>
        <CaptionsSettings />
      </ul>
    </TabPanel>
  )
}

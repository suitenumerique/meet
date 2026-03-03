import { Field, H } from '@/primitives'
import { css } from '@/styled-system/css'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import {
  accessibilityStore,
  type CaptionTextSize,
  CAPTION_TEXT_SIZE_OPTIONS,
} from '@/stores/accessibility'

export const CaptionsSettings = () => {
  const { t } = useTranslation('settings', {
    keyPrefix: 'accessibility.captions',
  })
  const snap = useSnapshot(accessibilityStore)

  const captionTextSizeItems = useMemo(
    () =>
      CAPTION_TEXT_SIZE_OPTIONS.map((size) => ({
        value: size,
        label: t(`textSize.options.${size}`),
      })),
    [t]
  )

  return (
    <li>
      <H
        lvl={3}
        className={css({
          marginBottom: '0.5rem',
        })}
      >
        {t('heading')}
      </H>
      <Field
        type="select"
        label={t('textSize.label')}
        items={captionTextSizeItems}
        selectedKey={snap.captionTextSize}
        onSelectionChange={(key) => {
          accessibilityStore.captionTextSize = key as CaptionTextSize
        }}
        wrapperProps={{ noMargin: true, fullWidth: true }}
      />
    </li>
  )
}

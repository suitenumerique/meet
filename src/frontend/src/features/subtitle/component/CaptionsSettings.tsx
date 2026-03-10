import { Field, H } from '@/primitives'
import { css } from '@/styled-system/css'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import {
  accessibilityStore,
  type CaptionTextSize,
  type CaptionFontColor,
  type CaptionBackgroundColor,
  CAPTION_TEXT_SIZE_OPTIONS,
  CAPTION_FONT_COLOR_OPTIONS,
  CAPTION_BACKGROUND_COLOR_OPTIONS,
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

  const captionFontColorItems = useMemo(
    () =>
      CAPTION_FONT_COLOR_OPTIONS.map((color) => ({
        value: color,
        label: t(`fontColor.options.${color}`),
      })),
    [t]
  )

  const captionBackgroundColorItems = useMemo(
    () =>
      CAPTION_BACKGROUND_COLOR_OPTIONS.map((color) => ({
        value: color,
        label: t(`backgroundColor.options.${color}`),
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
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        })}
      >
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
        <Field
          type="select"
          label={t('fontColor.label')}
          items={captionFontColorItems}
          selectedKey={snap.captionFontColor}
          onSelectionChange={(key) => {
            accessibilityStore.captionFontColor = key as CaptionFontColor
          }}
          wrapperProps={{ noMargin: true, fullWidth: true }}
        />
        <Field
          type="select"
          label={t('backgroundColor.label')}
          items={captionBackgroundColorItems}
          selectedKey={snap.captionBackgroundColor}
          onSelectionChange={(key) => {
            accessibilityStore.captionBackgroundColor =
              key as CaptionBackgroundColor
          }}
          wrapperProps={{ noMargin: true, fullWidth: true }}
        />
      </div>
    </li>
  )
}

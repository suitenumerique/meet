import { useMemo } from 'react'
import { RecordingLanguage } from '@/stores/recording'
import { useTranslation } from 'react-i18next'

export const useTranscriptionLanguageOptions = () => {
  const { t } = useTranslation('settings', { keyPrefix: 'transcription' })

  return useMemo(
    () => [
      {
        key: RecordingLanguage.FRENCH,
        value: RecordingLanguage.FRENCH,
        label: t('language.options.french'),
      },
      {
        key: RecordingLanguage.ENGLISH,
        value: RecordingLanguage.ENGLISH,
        label: t('language.options.english'),
      },
      {
        key: RecordingLanguage.AUTOMATIC,
        value: RecordingLanguage.AUTOMATIC,
        label: t('language.options.auto'),
      },
    ],
    [t]
  )
}

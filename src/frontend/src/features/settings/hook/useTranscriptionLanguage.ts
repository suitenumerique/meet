import { useMemo } from 'react'
import { RecordingLanguage, recordingStore } from '@/stores/recording'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio/index'

export const useTranscriptionLanguage = () => {
  const { t } = useTranslation('settings', { keyPrefix: 'transcription' })

  const recordingSnap = useSnapshot(recordingStore)

  const languages = useMemo(
    () => [
      {
        key: RecordingLanguage.FRENCH,
        label: t('language.options.french'),
      },
      {
        key: RecordingLanguage.ENGLISH,
        label: t('language.options.english'),
      },
      {
        key: RecordingLanguage.GERMAN,
        label: t('language.options.german'),
      },
      {
        key: RecordingLanguage.DUTCH,
        label: t('language.options.dutch'),
      },
      {
        key: RecordingLanguage.AUTOMATIC,
        label: t('language.options.auto'),
      },
    ],
    [t]
  )

  const languageOptions = useMemo(() => {
    return languages.map((i) => ({
      key: i.key,
      value: i.key,
      label: i.label,
    }))
  }, [languages])

  const { selectedLanguageKey, selectedLanguageLabel } = useMemo(() => {
    const selectedLanguageLabel = languages.find(
      (option) => option.key === recordingSnap.language
    )?.label

    const selectedLanguageKey = recordingSnap.language

    return { selectedLanguageKey, selectedLanguageLabel }
  }, [recordingSnap.language, languages])

  return {
    languageOptions,
    selectedLanguageKey,
    selectedLanguageLabel,
    isLanguageSetToAuto: selectedLanguageKey === RecordingLanguage.AUTOMATIC,
  }
}

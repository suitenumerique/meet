import { useTranslation } from 'react-i18next'

const languageLabels: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  nl: 'Nederlands',
  es: 'Español',
}

export const useLanguageLabels = () => {
  const { i18n } = useTranslation()
  // cimode is a testing value from i18next, don't include it
  const supportedLanguages = (i18n.options.supportedLngs || []).filter(
    (lang) => lang !== 'cimode'
  )
  const languagesList = supportedLanguages.map((lang) => ({
    key: lang,
    value: lang,
    label: languageLabels[lang],
  }))
  return {
    languagesList,
    currentLanguage: {
      key: i18n.language,
      label: languageLabels[i18n.language],
    },
  }
}

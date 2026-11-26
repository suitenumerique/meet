import i18n from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
const i18nDefaultNamespace = 'global'
const supportedLngs = ['en', 'fr', 'nl', 'de', 'es', 'pt'] as const
type SupportedLanguage = (typeof supportedLngs)[number]

// Fallback language used when the browser language is missing or unsupported.
// Configurable through the VITE_DEFAULT_LANGUAGE environment variable,
// defaults to French.
const configuredDefaultLanguage = import.meta.env.VITE_DEFAULT_LANGUAGE
const isSupportedLanguage = (lang: string): lang is SupportedLanguage =>
  (supportedLngs as readonly string[]).includes(lang)
const fallbackLng: SupportedLanguage =
  configuredDefaultLanguage && isSupportedLanguage(configuredDefaultLanguage)
    ? configuredDefaultLanguage
    : 'fr'

i18n.setDefaultNamespace(i18nDefaultNamespace)
i18n
  .use(
    resourcesToBackend((language: string, namespace: string) => {
      return import(`../locales/${language}/${namespace}.json`)
    })
  )
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    supportedLngs: [...supportedLngs],
    fallbackLng,
    ns: i18nDefaultNamespace,
    detection: {
      order: ['localStorage', 'navigator'],
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => {
    document.documentElement.setAttribute('lang', i18n.language || fallbackLng)
  })

i18n.on('languageChanged', (lang) => {
  document.documentElement.setAttribute('lang', lang)
})

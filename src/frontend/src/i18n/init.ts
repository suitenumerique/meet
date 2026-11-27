import i18n from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
const i18nDefaultNamespace = 'global'
const fallbackLng = 'fr'
// ?lang=xx (e.g. from the SDK create-button iframe) sets the language of this
// page only: it is not cached, so the language chosen in the app is kept.
const urlLang = new URLSearchParams(window.location.search).get('lang')

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
    supportedLngs: ['en', 'fr', 'nl', 'de', 'es', 'pt'],
    fallbackLng,
    ns: i18nDefaultNamespace,
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      caches: urlLang ? [] : ['localStorage'],
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

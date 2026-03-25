import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next'

const namespaces = [
  'global',
  'home',
  'rooms',
  'recording',
  'settings',
  'notifications',
  'legals',
  'termsOfService',
  'sdk',
  'accessibility',
] as const

export type AppNamespace = (typeof namespaces)[number]

/**
 * Frontend languages correspond to folders in `src/frontend/src/locales/<lng>/...`.
 * This repo currently ships: en, fr, nl.
 */
const supportedLanguages = ['en', 'fr', 'nl'] as const
type SupportedLanguage = (typeof supportedLanguages)[number]

const defaultLanguage: SupportedLanguage = 'fr'

const normalizeForPath = (lng: string): SupportedLanguage => {
  const base = lng.split('-')[0].toLowerCase()
  // If language detector returns something unexpected, fallback to default.
  if (base === 'en' || base === 'fr' || base === 'nl') return base
  return defaultLanguage
}

// Vite dynamic import map (lazy loaders for JSON)
// Each loader resolves to a module that usually looks like: { default: {...translations...} }
const localeModules = import.meta.glob('../locales/*/*.json')

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val)

type LocaleModule = { default?: unknown } | unknown

const unwrapLocaleModule = (mod: LocaleModule): Record<string, unknown> => {
  const maybeDefault =
    isRecord(mod) && 'default' in mod
      ? (mod as { default?: unknown }).default
      : undefined

  const candidate = maybeDefault ?? mod

  if (!isRecord(candidate)) {
    throw new Error('Invalid i18n resource format: expected a JSON object')
  }

  return candidate
}

i18n
  .use(
    resourcesToBackend(async (lng: string, ns: string) => {
      const normalized = normalizeForPath(lng)
      const key = `../locales/${normalized}/${ns}.json`

      const loader =
        localeModules[key] ?? localeModules[`../locales/en/${ns}.json`]

      if (!loader) {
        throw new Error(`Missing i18n resource file: ${key}`)
      }

      const mod = (await loader()) as LocaleModule
      return unwrapLocaleModule(mod)
    })
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: defaultLanguage,
    supportedLngs: [...supportedLanguages],
    ns: namespaces,
    defaultNS: 'global',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  })

export default i18n

// Map frontend language codes to backend language codes

export type BackendLanguage =
  | 'en-us'
  | 'fr-fr'
  | 'nl-nl'
  | 'de-de'
  | 'es-es'
  | 'ru-ru'
export type FrontendLanguage = 'en' | 'fr' | 'nl' | 'de' | 'es' | 'ru'

const frontendToBackendMap: Record<FrontendLanguage, BackendLanguage> = {
  en: 'en-us',
  fr: 'fr-fr',
  nl: 'nl-nl',
  de: 'de-de',
  es: 'es-es',
  ru: 'ru-ru',
}

export const convertToBackendLanguage = (
  frontendLang: string = 'fr'
): BackendLanguage => {
  return frontendToBackendMap[frontendLang as FrontendLanguage]
}

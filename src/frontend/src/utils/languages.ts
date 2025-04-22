// Map frontend language codes to backend language codes

export type BackendLanguage = 'en-us' | 'fr-fr' | 'nl-nl'
export type FrontendLanguage = 'en' | 'fr' | 'nl'

const frontendToBackendMap: Record<FrontendLanguage, BackendLanguage> = {
  en: 'en-us',
  fr: 'fr-fr',
  nl: 'nl-nl',
}

export const convertToBackendLanguage = (
  frontendLang: string = 'fr'
): BackendLanguage => {
  return frontendToBackendMap[frontendLang as FrontendLanguage]
}

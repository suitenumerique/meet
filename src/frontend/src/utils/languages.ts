// Map frontend language codes to backend language codes

export type BackendLanguage = 'en-us' | 'fr-fr' | 'nl-nl' | 'de-de' | 'es-es'
export type FrontendLanguage = 'en' | 'fr' | 'nl' | 'de' | 'es'

const frontendToBackendMap: Record<FrontendLanguage, BackendLanguage> = {
  en: 'en-us',
  fr: 'fr-fr',
  nl: 'nl-nl',
  de: 'de-de',
  es: 'es-es',
}

export const fallbackLng: FrontendLanguage = 'fr'

export const convertToBackendLanguage = (
  frontendLang: string = fallbackLng
): BackendLanguage | undefined => {
  return frontendToBackendMap[frontendLang as FrontendLanguage]
}

export const convertToFrontendLanguage = (
  backendLang: string
): FrontendLanguage | undefined => {
  return (Object.keys(frontendToBackendMap) as FrontendLanguage[]).find(
    (key) => frontendToBackendMap[key] === backendLang
  )
}

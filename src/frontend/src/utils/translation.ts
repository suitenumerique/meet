/**
 * FRAGILE: Splits translated text on placeholder to inject icons inline.
 *
 * Fragile because:
 * - Relies on exact string matching - typos break it silently
 * - Translators may accidentally modify/remove placeholders
 * - No validation or error handling
 */
export const injectIconIntoTranslation = (
  translation: string,
  placeholder: string = 'ICON_PLACEHOLDER'
) => {
  return translation.split(placeholder)
}

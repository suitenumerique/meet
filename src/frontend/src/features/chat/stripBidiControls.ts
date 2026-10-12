/**
 * Embeddings, overrides and isolates, invisible characters that reorder the
 * text after them, so a message could read differently from what was typed.
 */
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/g

/** The text with every bidi control character removed. */
export const stripBidiControls = (text: string) =>
  text.replace(BIDI_CONTROLS, '')

/**
 * The item with its message cleaned. An item with nothing to remove is
 * returned as is, so cleaning a whole list copies only the altered ones.
 */
export const withoutBidiControls = <T extends { message: string }>(
  item: T
): T => {
  const message = stripBidiControls(item.message)
  return message === item.message ? item : { ...item, message }
}

/**
 * Embeddings, overrides and isolates, invisible characters that reorder the
 * text after them, so a message could read differently from what was typed.
 */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g

/** The text with every bidi control character removed. */
export const stripBidiControls = (text: string) =>
  text.replace(BIDI_CONTROLS, '')

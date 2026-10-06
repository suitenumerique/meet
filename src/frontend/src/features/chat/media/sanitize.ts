import { MAX_CAPTION_LENGTH } from './constants'

/**
 * What a receiver keeps of the attributes a sender wrote into a stream's
 * header. Pure, so `sanitize.test.ts` covers it without a room.
 */

/**
 * Control characters would let a sender break the row's layout, and bidi
 * overrides would let them reorder what the caption appears to say. A newline
 * and a tab stay, since the sender's own row shows them. Matching control
 * characters is the point here, so the rule that normally catches them by
 * accident is suppressed deliberately.
 */
const CONTROL_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

export const sanitizeCaption = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(CONTROL_CHARACTERS, '').slice(0, MAX_CAPTION_LENGTH)
    : ''

export const sanitizeDimension = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

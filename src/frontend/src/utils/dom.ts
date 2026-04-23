const FOCUSABLE_SELECTOR =
  'input, select, textarea, button, object, a, area[href], [tabindex]'

/**
 * Find the first focusable descendant of `root`.
 * Works across documents (useful for the PiP window, which has its own
 * `document`). Pass the result of `ownerDocument.getElementById(...)` to
 * target an element in a specific document.
 */
export const findFirstFocusable = (
  root: HTMLElement | null | undefined
): HTMLElement | null =>
  root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? null

/**
 * Wrapper for the main document. Use `findFirstFocusable` when
 * working with a non-main document (e.g. the PiP window).
 */
export const getFirstControlBarFocusable = (id: string): HTMLElement | null =>
  findFirstFocusable(document.getElementById(id))

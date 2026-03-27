export const getFirstControlBarFocusable = (id: string): HTMLElement | null =>
  document
    .getElementById(id)
    ?.querySelector(
      'input, select, textarea, button, object, a, area[href], [tabindex]'
    ) ?? null

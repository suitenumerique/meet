/**
 * Theme scopes.
 *
 * The contextual colors are light by default. An element opens a scope for
 * itself and its descendants with `data-theme`, and scopes can be nested:
 *
 *   <div data-theme="dark">
 *     …rendered with the dark values…
 *     <aside data-theme="light">…back to the light ones…</aside>
 *   </div>
 */
export const conditions = {
  light: '[data-theme=light] &',
  dark: '[data-theme=dark] &',
}

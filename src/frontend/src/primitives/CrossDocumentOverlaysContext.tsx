import { createContext, useContext } from 'react'

/**
 * Signals that React Aria's default overlay positioning can't be trusted in
 * this subtree because the trigger and the rendered overlay live in different
 * documents (currently: picture-in-picture windows) — React Aria measures
 * against the main window's viewport, so tooltips, popovers, and menus end up
 * mispositioned in the host that actually displays them. When `true`, consumers
 * should bypass React Aria's positioning and handle placement themselves
 * (e.g. a visual-only tooltip); triggers should still carry an accessible name.
 */
export const CrossDocumentOverlaysContext = createContext(false)

export const useCrossDocumentOverlays = () =>
  useContext(CrossDocumentOverlaysContext)

import { createContext, useContext } from 'react'

/**
 * When true, tooltips render as visual-only (no aria-describedby).
 * Provided by surfaces where React Aria TooltipTrigger doesn't work
 * correctly (e.g. cross-document portals).
 */
export const VisualOnlyTooltipsContext = createContext(false)

export const useVisualOnlyTooltips = () => useContext(VisualOnlyTooltipsContext)

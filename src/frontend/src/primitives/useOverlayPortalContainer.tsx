import { useMemo } from 'react'
import { useUNSAFE_PortalContext } from '@react-aria/overlays'

/**
 * Hook to retrieve the portal container for overlays (menus, tooltips, popovers).
 * Returns the container from UNSAFE_PortalProvider context (pip-root in PiP, undefined in main window).
 */
export const useOverlayPortalContainer = () => {
  const { getContainer } = useUNSAFE_PortalContext()

  return useMemo(() => getContainer?.() ?? undefined, [getContainer])
}

/**
 * Hook to retrieve the boundary element for overlay positioning.
 * Returns the portal container in PiP (for PiP-relative positioning), undefined in main window.
 */
export const useOverlayBoundaryElement = () => {
  const portalContainer = useOverlayPortalContainer()
  return portalContainer
}

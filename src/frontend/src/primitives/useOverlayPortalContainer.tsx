import { useMemo } from 'react'
import { useUNSAFE_PortalContext } from '@react-aria/overlays'

export const useOverlayPortalContainer = () => {
  const { getContainer } = useUNSAFE_PortalContext()

  // Read the portal container provided by UNSAFE_PortalProvider.
  // This is how overlays know which document/window they should render into.
  // "UNSAFE" means we're overriding the library default container on purpose.
  return useMemo(() => getContainer?.() ?? undefined, [getContainer])
}

export const useOverlayBoundaryElement = () => {
  const portalContainer = useOverlayPortalContainer()
  return useMemo(() => {
    // Use the portal container as the positioning boundary.
    // In PiP this keeps overlays positioned relative to the PiP window.
    if (portalContainer) return portalContainer
    return undefined
  }, [portalContainer])
}


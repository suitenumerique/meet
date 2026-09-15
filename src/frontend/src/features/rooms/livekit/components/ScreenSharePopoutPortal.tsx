import { createPortal } from 'react-dom'
import { UNSAFE_PortalProvider } from '@react-aria/overlays'
import { ScreenReaderAnnouncer } from '@/primitives'
import { CrossDocumentOverlaysContext } from '@/primitives/CrossDocumentOverlaysContext'

/**
 * Render in the popup. Tooltips have to live there too, or they show up
 * in the meeting window instead.
 */
export const ScreenSharePopoutPortal = ({
  container,
  children,
}: {
  container: HTMLElement
  children: React.ReactNode
}) => {
  if (!container.isConnected) return null

  return createPortal(
    <UNSAFE_PortalProvider getContainer={() => container}>
      <CrossDocumentOverlaysContext.Provider value={true}>
        {/* The meeting live region sits in the other document, which a screen
            reader stops reading once the focus is here. */}
        <ScreenReaderAnnouncer />
        {children}
      </CrossDocumentOverlaysContext.Provider>
    </UNSAFE_PortalProvider>,
    container
  )
}

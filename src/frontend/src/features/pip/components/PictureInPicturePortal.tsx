import { usePictureInPicture } from '../hooks/usePictureInPicture'
import { createPortal } from 'react-dom'
import { UNSAFE_PortalProvider } from '@react-aria/overlays'
import { documentPictureInPictureStore } from '@/stores/documentPictureInPicture'
import { useSnapshot } from 'valtio'
import { useEffect, useMemo } from 'react'
import { CrossDocumentOverlaysContext } from '@/primitives/CrossDocumentOverlaysContext'

const InternalPortal = ({ children }: { children: React.ReactNode }) => {
  const pipStoreSnap = useSnapshot(documentPictureInPictureStore)

  const container = useMemo(() => {
    return pipStoreSnap?.window?.document.getElementById('root')
  }, [pipStoreSnap.window])

  useEffect(() => {
    return () => {
      documentPictureInPictureStore.window?.close()
    }
  }, [])

  if (!container) return null

  return createPortal(
    /**
     * UNSAFE_PortalProvider is marked unsafe because overlays are normally
     * portalled to `document.body` to avoid clipping, stacking, and accessibility
     * issues. Redirecting them to another container can break those guarantees.
     *
     * We accept that risk here because the PiP window is a separate document with
     * its own `body`. Rendering overlays into the main document would make them
     * invisible in PiP, so we intentionally portal them into the PiP document root
     * instead.
     */
    <UNSAFE_PortalProvider getContainer={() => container}>
      {/*React Aria computes overlay position based on the main window size, so*/}
      {/*we must disable it to position overlays correctly across documents.*/}
      <CrossDocumentOverlaysContext.Provider value={true}>
        {children}
      </CrossDocumentOverlaysContext.Provider>
    </UNSAFE_PortalProvider>,
    container
  )
}

export const PictureInPicturePortal = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const { isSupported } = usePictureInPicture()

  if (!isSupported) return null

  return <InternalPortal>{children}</InternalPortal>
}

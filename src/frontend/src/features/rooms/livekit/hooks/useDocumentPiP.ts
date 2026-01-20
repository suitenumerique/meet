import { useCallback, useEffect, useMemo, useState } from 'react'

type DocumentPictureInPicture = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

type WindowWithDocumentPiP = Window & {
  documentPictureInPicture?: DocumentPictureInPicture
}

export const useDocumentPiP = ({
  width = 480,
  height = 270,
}: {
  width?: number
  height?: number
} = {}) => {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)

  const isSupported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return 'documentPictureInPicture' in window
  }, [])

  const openPiP = useCallback(async () => {
    if (!isSupported) return null
    if (pipWindow && !pipWindow.closed) return pipWindow

    const pip = (window as WindowWithDocumentPiP).documentPictureInPicture
    if (!pip) return null

    const win = await pip.requestWindow({ width, height })
    setPipWindow(win)
    return win
  }, [height, isSupported, pipWindow, width])

  const closePiP = useCallback(() => {
    if (!pipWindow) return
    if (!pipWindow.closed) {
      pipWindow.close()
    }
    setPipWindow(null)
  }, [pipWindow])

  useEffect(() => {
    if (!pipWindow) return

    const handleClose = () => {
      setPipWindow(null)
    }

    pipWindow.addEventListener('pagehide', handleClose)
    pipWindow.addEventListener('beforeunload', handleClose)

    return () => {
      pipWindow.removeEventListener('pagehide', handleClose)
      pipWindow.removeEventListener('beforeunload', handleClose)
    }
  }, [pipWindow])

  return {
    isSupported,
    isOpen: !!pipWindow && !pipWindow.closed,
    pipWindow,
    openPiP,
    closePiP,
  }
}


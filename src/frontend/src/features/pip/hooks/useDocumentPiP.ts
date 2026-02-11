import { useCallback, useEffect, useRef, useState } from 'react'

type DocumentPictureInPicture = {
  requestWindow: (options?: {
    width?: number
    height?: number
  }) => Promise<Window>
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
  const pipWindowRef = useRef<Window | null>(null)
  const pendingPiPRef = useRef<Promise<Window | null> | null>(null)

  const [isSupported] = useState(() => {
    if (typeof window === 'undefined') return false
    return 'documentPictureInPicture' in window
  })

  const openPiP = useCallback(async () => {
    if (!isSupported) return null
    const existingWindow = pipWindowRef.current
    if (existingWindow && !existingWindow.closed) return existingWindow

    if (pendingPiPRef.current) return pendingPiPRef.current

    // Request a new PiP window from the browser API.
    const pip = (window as WindowWithDocumentPiP).documentPictureInPicture
    if (!pip) return null

    const requestPromise = (async () => {
      try {
        const win = await pip.requestWindow({ width, height })
        const currentWindow = pipWindowRef.current
        if (currentWindow && !currentWindow.closed) return currentWindow
        setPipWindow(win)
        return win
      } catch (error) {
        // Avoid unhandled rejections if the user blocks or closes the request.
        console.error('Failed to open Picture-in-Picture window', error)
        return null
      } finally {
        pendingPiPRef.current = null
      }
    })()

    pendingPiPRef.current = requestPromise
    return requestPromise
  }, [height, isSupported, width])

  const closePiP = useCallback(() => {
    if (!pipWindow) return
    if (!pipWindow.closed) {
      pipWindow.close()
    }
    setPipWindow(null)
  }, [pipWindow])

  useEffect(() => {
    pipWindowRef.current = pipWindow
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { reportError } from '@/features/analytics/telemetry'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import {
  getAuxiliaryWindowFeatures,
  getAuxiliaryWindowSize,
  initializeAuxiliaryWindow,
} from '@/utils/auxiliaryWindow'

type UseScreenSharePopoutOptions = {
  windowName: string
  title: string
  getVideoElement?: () => HTMLVideoElement | null
}

type PopoutTarget = {
  window: Window
  container: HTMLElement
}

/**
 * Opens the screen share in another window. Closing it does not stop the
 * share: the video just comes back into the meeting.
 *
 * A real popup, not the meeting PiP, that one is already taken, and a
 * popup can be as large as another screen.
 */
export const useScreenSharePopout = ({
  windowName,
  title,
  getVideoElement,
}: UseScreenSharePopoutOptions) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()
  const [target, setTarget] = useState<PopoutTarget | null>(null)
  const targetRef = useRef<PopoutTarget | null>(null)

  // Brings the video back into the meeting, from the toolbar button as well as
  // from the window's own close button.
  const release = useCallback(() => {
    if (!targetRef.current) return
    // Focus the meeting first so we can put the cursor back on the button.
    window.focus()
    // Unmount while the other document is still alive: React cannot clean up
    // children in a window that is already gone.
    flushSync(() => {
      targetRef.current = null
      setTarget(null)
    })
    announce(t('separateWindowClosed'), 'assertive')
  }, [announce, t])

  const close = useCallback(() => {
    const current = targetRef.current?.window
    if (!current) return
    release()
    current.close()
  }, [release])

  const open = useCallback(() => {
    if (targetRef.current) return

    const { width, height } = getAuxiliaryWindowSize(getVideoElement?.())
    // Open right away: waiting first (fullscreen, etc.) lets the browser
    // block the popup.
    const next = window.open(
      '',
      windowName,
      getAuxiliaryWindowFeatures(width, height)
    )

    if (!next) {
      announce(t('separateWindowBlocked'), 'assertive')
      return
    }

    try {
      const container = initializeAuxiliaryWindow(next, { title })

      // The window X does not go through our close() — still bring the video back.
      next.addEventListener('pagehide', release, { once: true })

      targetRef.current = { window: next, container }
      setTarget(targetRef.current)
      next.focus()
      announce(t('separateWindowOpened'), 'assertive')
      // Drop meeting fullscreen or we would only see the placeholder.
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      }
    } catch (error) {
      reportError('generic_failure', error, {
        context: 'screen_share_popout_init',
      })
      next.close()
    }
  }, [announce, getVideoElement, release, t, title, windowName])

  const toggle = useCallback(() => {
    if (targetRef.current) close()
    else open()
  }, [close, open])

  // Tile gone (share ended, layout change): close a leftover empty window.
  useEffect(() => {
    return () => {
      targetRef.current?.window.close()
      targetRef.current = null
    }
  }, [])

  return {
    isOpen: !!target,
    container: target?.container ?? null,
    open,
    close,
    toggle,
  }
}

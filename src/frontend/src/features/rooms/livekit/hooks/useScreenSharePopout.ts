import { useCallback } from 'react'
import { useSnapshot } from 'valtio'
import { useTranslation } from 'react-i18next'
import { reportError } from '@/features/analytics/telemetry'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import {
  closeScreenSharePopout,
  openScreenSharePopout,
  screenSharePopoutStore,
} from '@/stores/screenSharePopout'
import {
  getAuxiliaryWindowFeatures,
  getAuxiliaryWindowSize,
  initializeAuxiliaryWindow,
} from '@/utils/auxiliaryWindow'

type UseScreenSharePopoutOptions = {
  trackSid: string
  windowName: string
  title: string
  getVideoElement?: () => HTMLVideoElement | null
}

/**
 * Opens the screen share in another window. Closing it does not stop the
 * share: the video just comes back into the meeting.
 *
 * The window lives in a store, not in this hook. Opening it drops the stage
 * pin, so the tile moves from the focus layout into the grid and this
 * component remounts. The store is what keeps the window open across that.
 *
 * A real popup, not the meeting PiP, that one is already taken, and a
 * popup can be as large as another screen.
 */
export const useScreenSharePopout = ({
  trackSid,
  windowName,
  title,
  getVideoElement,
}: UseScreenSharePopoutOptions) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()
  const { entry } = useSnapshot(screenSharePopoutStore)
  const isOpen = entry?.trackSid === trackSid

  // Brings the video back into the meeting, from the toolbar button as well as
  // from the window's own close button. Safe to call after this hook's
  // component has unmounted: the listener sits on the popup, not on the tile.
  const release = useCallback(() => {
    if (screenSharePopoutStore.entry?.trackSid !== trackSid) return
    closeScreenSharePopout({ restorePin: true })
    announce(t('separateWindowClosed'), 'assertive')
  }, [announce, t, trackSid])

  const open = useCallback(() => {
    if (screenSharePopoutStore.entry) return

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

      openScreenSharePopout({
        trackSid,
        popup: next,
        container,
        // The window X does not go through close() — still bring the video back.
        onPopupClosed: release,
      })
      next.focus()
      announce(t('separateWindowOpened'), 'assertive')
      // Drop meeting fullscreen: the stage this share was filling goes away.
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      }
    } catch (error) {
      reportError('generic_failure', error, {
        context: 'screen_share_popout_init',
      })
      next.close()
    }
  }, [announce, getVideoElement, release, t, title, trackSid, windowName])

  const toggle = useCallback(() => {
    if (screenSharePopoutStore.entry?.trackSid === trackSid) release()
    else open()
  }, [open, release, trackSid])

  return {
    isOpen,
    // The snapshot deep-freezes the element. The portal needs the real node,
    // which `ref()` kept out of the proxy.
    container: isOpen
      ? (screenSharePopoutStore.entry?.container ?? null)
      : null,
    open,
    close: release,
    toggle,
  }
}

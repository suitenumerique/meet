import { flushSync } from 'react-dom'
import { proxy, ref } from 'valtio'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import type { ZoomState } from '@/features/rooms/livekit/hooks/useScreenShareZoom'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'

type Entry = {
  trackSid: string
  window: Window
  container: HTMLElement
  // Pin that was on screen when the window opened. Restored on close so the
  // share (or whichever tile was focused) comes back. Absent when the meeting
  // was already in grid view.
  pinnedTrack?: TrackReferenceOrPlaceholder
  detachListeners: () => void
}

export const screenSharePopoutStore = proxy<{ entry: Entry | null }>({
  entry: null,
})

// Opening and closing both move the video between documents, which remounts
// the tile. These two slots carry what must survive that remount. They are
// armed by the transitions below, so an unrelated remount keeps its previous
// behaviour: the zoom resets and the focus stays where it was.
let armedSid: string | null = null
let carriedZoom: { trackSid: string; state: ZoomState } | null = null
let pendingButtonFocusSid: string | null = null

export const saveScreenShareZoom = (trackSid: string, state: ZoomState) => {
  if (armedSid !== trackSid) return
  // One save per transition, so a later unrelated remount starts from scratch.
  armedSid = null
  carriedZoom = { trackSid, state }
}

export const takeScreenShareZoom = (trackSid: string) => {
  if (carriedZoom?.trackSid !== trackSid) return null
  const { state } = carriedZoom
  carriedZoom = null
  return state
}

export const takePopoutButtonFocus = (trackSid: string) => {
  if (pendingButtonFocusSid !== trackSid) return false
  pendingButtonFocusSid = null
  return true
}

export const openScreenSharePopout = ({
  trackSid,
  popup,
  container,
  onPopupClosed,
}: {
  trackSid: string
  popup: Window
  container: HTMLElement
  onPopupClosed: () => void
}) => {
  const popupHidden = () => onPopupClosed()
  // The meeting tab is going away: drop the window rather than run the
  // bring-back flow, which would touch React while the page tears down.
  const openerHidden = () => {
    popup.removeEventListener('pagehide', popupHidden)
    popup.close()
  }
  popup.addEventListener('pagehide', popupHidden, { once: true })
  window.addEventListener('pagehide', openerHidden)

  const pinnedTrack = layoutStore.pinnedTrackRef
  armedSid = trackSid
  screenSharePopoutStore.entry = {
    trackSid,
    window: ref(popup),
    container: ref(container),
    pinnedTrack: pinnedTrack ? ref(pinnedTrack) : undefined,
    detachListeners: () => {
      popup.removeEventListener('pagehide', popupHidden)
      window.removeEventListener('pagehide', openerHidden)
    },
  }
  // The share (or another pin) was filling the stage. Grid view leaves the
  // rest of the meeting the whole window while the share is outside.
  if (pinnedTrack) clearPinnedTrack()
}

// Clears the popout. The previous pin is restored only when the video is
// coming back: if the share itself ended, that pin points at a dead track.
export const closeScreenSharePopout = ({
  restorePin,
}: {
  restorePin: boolean
}) => {
  const entry = screenSharePopoutStore.entry
  if (!entry) return
  const { window: popup, pinnedTrack, trackSid, detachListeners } = entry
  detachListeners()

  if (restorePin) {
    // Both must be set before the render below: it remounts the tile, which
    // reads them from its layout effect.
    armedSid = trackSid
    pendingButtonFocusSid = trackSid
    // Put the cursor back in the meeting so the tile can focus its button.
    window.focus()
  } else {
    armedSid = null
    carriedZoom = null
    pendingButtonFocusSid = null
  }

  // Unmount the portal while the other document is still alive, and put the
  // pin back in the same render so the share doesn't flash through the grid.
  flushSync(() => {
    screenSharePopoutStore.entry = null
    if (restorePin && pinnedTrack && !layoutStore.pinnedTrackRef) {
      setPinnedTrack(pinnedTrack)
    }
  })
  popup.close()
  armedSid = null
}

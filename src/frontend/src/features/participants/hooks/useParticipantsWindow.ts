import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { layoutStore } from '@/stores/layout'
import { PanelId } from '@/features/rooms/livekit/hooks/useSidePanel'

/**
 * A same-origin auxiliary window, rendering the existing LiveKit-connected
 * participants tree through a React portal. No extra room connection or token.
 */
export const useParticipantsWindow = () => {
  const popupRef = useRef<Window | null>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  const close = useCallback((restorePanel = true) => {
    const popup = popupRef.current
    if (!popup) return
    popupRef.current = null
    // Unmount the portal before its document disappears.
    flushSync(() => setContainer(null))
    if (restorePanel) layoutStore.activePanelId = PanelId.PARTICIPANTS
    if (!popup.closed) popup.close()
  }, [])

  const open = useCallback((title: string) => {
    if (popupRef.current) return
    // Must be called synchronously from the button's user gesture.
    const popup = window.open(
      '',
      '_blank',
      'popup=yes,width=390,height=620,resizable=yes,scrollbars=yes'
    )
    if (!popup) return

    try {
      // about:blank inherits the opener's origin, retaining the React context.
      // Never navigate this window to a remote URL or interpolate HTML.
      // The popup needs no reference back to the opener.
      popup.opener = null
      popup.document.title = title
      popup.document.documentElement.lang = document.documentElement.lang
      popup.document.documentElement.className =
        document.documentElement.className
      popup.document.documentElement.style.cssText =
        document.documentElement.style.cssText
      const theme = document.documentElement.dataset.lkTheme
      if (theme) popup.document.documentElement.dataset.lkTheme = theme
      document.head
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) =>
          popup.document.head.appendChild(node.cloneNode(true))
        )

      popup.document.body.style.margin = '0'
      popup.document.body.style.height = '100vh'
      const root = popup.document.createElement('div')
      root.style.height = '100%'
      popup.document.body.appendChild(root)
      popupRef.current = popup
      setContainer(root)
      layoutStore.activePanelId = null
      layoutStore.activeSubPanelId = null
      popup.focus()
    } catch {
      popup.close()
    }
  }, [])

  useEffect(() => {
    const popup = popupRef.current
    if (!popup || !container) return
    const onPopupClosed = () => close()
    const onMeetingClosed = () => close(false)
    popup.addEventListener('pagehide', onPopupClosed)
    window.addEventListener('pagehide', onMeetingClosed)
    return () => {
      popup.removeEventListener('pagehide', onPopupClosed)
      window.removeEventListener('pagehide', onMeetingClosed)
    }
  }, [container, close])

  // Disconnect/unmount can happen without navigating away.
  useEffect(
    () => () => {
      const popup = popupRef.current
      popupRef.current = null
      if (popup && !popup.closed) popup.close()
    },
    []
  )

  return { container, open, close }
}

// We use vendor prefix properties
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { useMemo, useState } from 'react'
import { type TrackReferenceOrPlaceholder } from '@livekit/components-core'

export function useFullScreen({
  trackRef,
}: {
  trackRef?: TrackReferenceOrPlaceholder
}) {
  const videoElement = useMemo(() => {
    const elements = trackRef?.publication?.track?.attachedElements

    if (!elements) return

    // Find the visible video element
    const likeKitElement = elements.find((el) =>
      el.classList.contains('lk-participant-media-video')
    )

    if (!likeKitElement) {
      console.warn('Could not find LiveKit-managed video element')
      return elements[0] || null
    }

    return likeKitElement
  }, [trackRef])

  const getIsFullscreen = () => {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    )
  }

  const [isFullscreenAvailable] = useState(
    () =>
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled
  )

  const enterFullscreen = async () => {
    try {
      const docEl = videoElement || document.documentElement
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen()
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen()
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen()
      }
    } catch (error) {
      console.error('Error entering fullscreen:', error)
    }
  }

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen()
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen()
      }
    } catch (error) {
      console.error('Error exiting fullscreen:', error)
    }
  }

  const toggleFullScreen = async () => {
    const isCurrentlyFullscreen = getIsFullscreen()
    if (isCurrentlyFullscreen) {
      await exitFullscreen()
    } else {
      await enterFullscreen()
    }
  }

  return {
    isCurrentlyFullscreen: getIsFullscreen(),
    isFullscreenAvailable,
    toggleFullScreen,
  }
}

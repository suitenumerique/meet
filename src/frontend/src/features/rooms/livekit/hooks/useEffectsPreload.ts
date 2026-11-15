import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMaybeRoomContext } from '@livekit/components-react'
import { ConnectionQuality } from 'livekit-client'
import {
  preloadBackgroundImage,
  preloadEffectsAssets,
} from '../components/blur/preload'

// Time the pointer must stay on an element before preloading, so that
// sweeping over a menu or a row of thumbnails does not trigger anything.
const HOVER_INTENT_DELAY_MS = 150

/**
 * Preload the background effects assets when the user shows an intent to
 * use them, to save the download time once they actually click.
 *
 * In a meeting, the heavy assets are skipped when the connection quality
 * is degraded, to avoid competing with the media streams.
 */
export const useEffectsPreload = () => {
  const room = useMaybeRoomContext()
  const timeout = useRef<ReturnType<typeof setTimeout>>()

  const cancel = useCallback(() => clearTimeout(timeout.current), [])
  useEffect(() => cancel, [cancel])

  const schedule = useCallback(
    (preload: (options: { isConstrained: boolean }) => void) => {
      cancel()
      timeout.current = setTimeout(() => {
        // Read when firing: no need to re-render on quality changes.
        const quality = room?.localParticipant.connectionQuality
        preload({
          isConstrained:
            quality === ConnectionQuality.Poor ||
            quality === ConnectionQuality.Lost,
        })
      }, HOVER_INTENT_DELAY_MS)
    },
    [cancel, room]
  )

  const preloadEffects = useCallback(
    () => schedule(preloadEffectsAssets),
    [schedule]
  )

  const preloadBackground = useCallback(
    (imagePath: string) =>
      schedule((options) => void preloadBackgroundImage(imagePath, options)),
    [schedule]
  )

  return useMemo(
    () => ({
      hoverProps: { onHoverStart: preloadEffects, onHoverEnd: cancel },
      focusProps: { onFocus: preloadEffects, onBlur: cancel },
      preloadBackground,
      cancel,
    }),
    [cancel, preloadBackground, preloadEffects]
  )
}

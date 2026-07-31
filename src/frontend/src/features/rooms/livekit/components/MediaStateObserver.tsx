import { useLocalParticipant } from '@livekit/components-react'
import { useEffect } from 'react'

export const MEDIA_STATE_ELEMENT_ID = 'media-state'
export const MEDIA_STATE_CHANGED_EVENT = 'media-state-changed'

export type MediaStateChangedDetail = {
  microphoneEnabled: boolean
  cameraEnabled: boolean
}

/**
 * Exposes the local participant's media state in the DOM so external tools
 * (e.g. bots automating the frontend) can reliably read the microphone and
 * camera state, and watch for changes with a MutationObserver:
 *
 * const el = document.getElementById('media-state')
 * new MutationObserver(...).observe(el, { attributes: true })
 */
export const MediaStateObserver = () => {
  const { isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant()

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<MediaStateChangedDetail>(MEDIA_STATE_CHANGED_EVENT, {
        detail: {
          microphoneEnabled: isMicrophoneEnabled,
          cameraEnabled: isCameraEnabled,
        },
      })
    )
  }, [isMicrophoneEnabled, isCameraEnabled])

  return (
    <div
      id={MEDIA_STATE_ELEMENT_ID}
      style={{ display: 'none' }}
      data-microphone-enabled={isMicrophoneEnabled ? 'true' : 'false'}
      data-camera-enabled={isCameraEnabled ? 'true' : 'false'}
    />
  )
}

import { useLocalParticipant } from '@livekit/components-react'
import { TrackSource } from '@livekit/protocol'
import { useEffect } from 'react'
import { useCanPublishTrack } from '@/features/rooms/livekit/hooks/useCanPublishTrack'

export const MEDIA_STATE_ELEMENT_ID = 'media-state'
export const MEDIA_STATE_CHANGED_EVENT = 'media-state-changed'

export type MediaStateChangedDetail = {
  microphoneEnabled: boolean
  cameraEnabled: boolean
  canPublishMicrophone: boolean
  canPublishCamera: boolean
}

/**
 * Exposes the local participant's media state in the DOM so external tools
 * (e.g. bots automating the frontend) can reliably read the microphone and
 * camera state, and watch for changes with a MutationObserver:
 *
 * const el = document.getElementById('media-state')
 * new MutationObserver(...).observe(el, { attributes: true })
 *
 * The publish permissions are exposed alongside the state: an external tool
 * cannot tell a muted microphone from one it is not allowed to unmute, and
 * would otherwise offer a control that silently does nothing.
 */
export const MediaStateObserver = () => {
  const { isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant()
  const canPublishMicrophone = useCanPublishTrack(TrackSource.MICROPHONE)
  const canPublishCamera = useCanPublishTrack(TrackSource.CAMERA)

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<MediaStateChangedDetail>(MEDIA_STATE_CHANGED_EVENT, {
        detail: {
          microphoneEnabled: isMicrophoneEnabled,
          cameraEnabled: isCameraEnabled,
          canPublishMicrophone,
          canPublishCamera,
        },
      })
    )
  }, [
    isMicrophoneEnabled,
    isCameraEnabled,
    canPublishMicrophone,
    canPublishCamera,
  ])

  return (
    <div
      id={MEDIA_STATE_ELEMENT_ID}
      style={{ display: 'none' }}
      data-microphone-enabled={isMicrophoneEnabled ? 'true' : 'false'}
      data-camera-enabled={isCameraEnabled ? 'true' : 'false'}
      data-can-publish-microphone={canPublishMicrophone ? 'true' : 'false'}
      data-can-publish-camera={canPublishCamera ? 'true' : 'false'}
    />
  )
}

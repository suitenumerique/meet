import { useLocalParticipant } from '@livekit/components-react'
import type { LocalVideoTrack } from 'livekit-client'
import { EffectsConfiguration } from './EffectsConfiguration'
import { useCanPublishTrack } from '@/features/rooms/livekit/hooks/useCanPublishTrack'
import { TrackSource } from '@livekit/protocol'
import { sidePanelScrollArea } from '@/features/rooms/livekit/components/sidePanelScrollArea'

export const Effects = () => {
  const { cameraTrack } = useLocalParticipant()
  const localCameraTrack = cameraTrack?.track as LocalVideoTrack

  const canPublishCamera = useCanPublishTrack(TrackSource.CAMERA)

  return (
    <div className={sidePanelScrollArea()}>
      <EffectsConfiguration
        isDisabled={!canPublishCamera}
        videoTrack={localCameraTrack}
        layout="vertical"
      />
    </div>
  )
}

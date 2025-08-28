import { useLocalParticipant } from '@livekit/components-react'
import { LocalVideoTrack } from 'livekit-client'
import { css } from '@/styled-system/css'
import { EffectsConfiguration } from './EffectsConfiguration'
import { usePersistentUserChoices } from '../../hooks/usePersistentUserChoices'
import { useCanPublishTrack } from '@/features/rooms/livekit/hooks/useCanPublishTrack'
import { TrackSource } from '@livekit/protocol'

export const Effects = () => {
  const { cameraTrack } = useLocalParticipant()
  const localCameraTrack = cameraTrack?.track as LocalVideoTrack
  const { saveProcessorSerialized } = usePersistentUserChoices()

  const canPublishCamera = useCanPublishTrack(TrackSource.CAMERA)

  return (
    <div
      className={css({
        padding: '0 1.5rem',
        overflowY: 'scroll',
      })}
    >
      <EffectsConfiguration
        isDisabled={!canPublishCamera}
        videoTrack={localCameraTrack}
        layout="vertical"
        onSubmit={(processor) =>
          saveProcessorSerialized(processor?.serialize())
        }
      />
    </div>
  )
}

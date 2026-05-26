import { useEffect } from 'react'
import { Track } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { RnnNoiseProcessor } from '../processors/RnnNoiseProcessor'
import { useNoiseReductionAvailable } from '@/features/rooms/livekit/hooks/useNoiseReductionAvailable'
import { useSnapshot } from 'valtio'
import { userChoicesStore } from '@/stores/userChoices'

export const useNoiseReduction = () => {
  const room = useRoomContext()
  const noiseReductionAvailable = useNoiseReductionAvailable()

  const { noiseReductionEnabled } = useSnapshot(userChoicesStore)

  const audioTrack = room.localParticipant.getTrackPublication(
    Track.Source.Microphone
  )?.audioTrack

  useEffect(() => {
    if (!audioTrack || !noiseReductionAvailable) return

    const processor = audioTrack?.getProcessor()

    if (noiseReductionEnabled && !processor) {
      const rnnNoiseProcessor = new RnnNoiseProcessor()
      audioTrack.setProcessor(rnnNoiseProcessor)
    } else if (!noiseReductionEnabled && processor) {
      audioTrack.stopProcessor()
    }
  }, [audioTrack, noiseReductionEnabled, noiseReductionAvailable])
}

import { useLocalParticipant } from '@livekit/components-react'
import type { LocalTrack } from 'livekit-client'
import { useSyncTrackDeviceId } from '../hooks/useSyncTrackDeviceId'
import {
  saveAudioInputDeviceId,
  saveVideoInputDeviceId,
} from '@/stores/userChoices'

export const SyncDevicePreferences = () => {
  const { cameraTrack, microphoneTrack } = useLocalParticipant()
  useSyncTrackDeviceId(
    cameraTrack?.track as LocalTrack | undefined,
    saveVideoInputDeviceId
  )
  useSyncTrackDeviceId(
    microphoneTrack?.track as LocalTrack | undefined,
    saveAudioInputDeviceId
  )
  return null
}

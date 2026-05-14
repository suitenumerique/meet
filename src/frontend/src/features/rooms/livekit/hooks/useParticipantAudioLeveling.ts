import { useEffect, useRef } from 'react'
import { RemoteAudioTrack, Track } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useSnapshot } from 'valtio'
import { userPreferencesStore } from '@/stores/userPreferences'

const TARGET_AUDIO_LEVEL = 0.35
const MIN_GAIN = 0.6
const MAX_GAIN = 1
const SMOOTHING_FACTOR = 0.08
const UPDATE_INTERVAL_MS = 500
const MIN_AUDIO_LEVEL = 0.02

export const useParticipantAudioLeveling = () => {
  const room = useRoomContext()
  const { is_participant_audio_leveling_enabled: enabled } =
    useSnapshot(userPreferencesStore)

  // track sid → current smoothed gain
  const gainMapRef = useRef<Map<string, number>>(new Map())
  // direct track object refs so reset works even if tracks are unpublished/muted
  const touchedTracksRef = useRef<Set<RemoteAudioTrack>>(new Set())

  useEffect(() => {
    const resetTouchedTracks = () => {
      for (const track of touchedTracksRef.current) {
        track.setVolume(1)
      }
      gainMapRef.current.clear()
      touchedTracksRef.current.clear()
    }

    if (!enabled) {
      resetTouchedTracks()
      return
    }

    const interval = setInterval(() => {
      for (const participant of room.remoteParticipants.values()) {
        const pub = participant.getTrackPublication(Track.Source.Microphone)
        const audioTrack = pub?.audioTrack
        if (!audioTrack || !pub.trackSid) continue
        if (!(audioTrack instanceof RemoteAudioTrack)) continue

        const sid = pub.trackSid
        const audioLevel = participant.audioLevel

        if (audioLevel < MIN_AUDIO_LEVEL) continue

        const prevGain = gainMapRef.current.get(sid) ?? 1
        const desiredGain = TARGET_AUDIO_LEVEL / audioLevel
        const clampedGain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, desiredGain))
        const smoothedGain =
          prevGain + SMOOTHING_FACTOR * (clampedGain - prevGain)

        gainMapRef.current.set(sid, smoothedGain)
        touchedTracksRef.current.add(audioTrack)
        audioTrack.setVolume(smoothedGain)
      }
    }, UPDATE_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      resetTouchedTracks()
    }
  }, [enabled, room])
}

import { useEffect, useRef } from 'react'
import {
  RemoteAudioTrack,
  RemoteTrack,
  RemoteTrackPublication,
  RoomEvent,
  Track,
} from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useSnapshot } from 'valtio'
import { userPreferencesStore } from '@/stores/userPreferences'

const TARGET_AUDIO_LEVEL = 0.35
const MIN_GAIN = 0.6
const MAX_GAIN = 1
const ATTENUATION_SMOOTHING_FACTOR = 0.25
const RECOVERY_SMOOTHING_FACTOR = 0.08
const UPDATE_INTERVAL_MS = 500
const MIN_AUDIO_LEVEL = 0.02
// gap to MAX_GAIN below which a recovering track is snapped to exactly 1
const RECOVERY_EPSILON = 0.01

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

    const handleTrackUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication
    ) => {
      if (!(track instanceof RemoteAudioTrack)) return
      if (!touchedTracksRef.current.has(track)) return

      track.setVolume(1)
      touchedTracksRef.current.delete(track)
      gainMapRef.current.delete(publication.trackSid)
    }

    if (!enabled) {
      resetTouchedTracks()
      return
    }

    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)

    const interval = setInterval(() => {
      for (const participant of room.remoteParticipants.values()) {
        const pub = participant.getTrackPublication(Track.Source.Microphone)
        const audioTrack = pub?.audioTrack
        if (!audioTrack || !pub.trackSid) continue
        if (!(audioTrack instanceof RemoteAudioTrack)) continue

        const sid = pub.trackSid
        const audioLevel = participant.audioLevel

        if (audioLevel < MIN_AUDIO_LEVEL) {
          const prevGain = gainMapRef.current.get(sid)
          if (prevGain === undefined || prevGain >= MAX_GAIN) continue

          const recoveredGain =
            prevGain + RECOVERY_SMOOTHING_FACTOR * (MAX_GAIN - prevGain)

          if (MAX_GAIN - recoveredGain < RECOVERY_EPSILON) {
            audioTrack.setVolume(MAX_GAIN)
            gainMapRef.current.delete(sid)
            touchedTracksRef.current.delete(audioTrack)
          } else {
            gainMapRef.current.set(sid, recoveredGain)
            touchedTracksRef.current.add(audioTrack)
            audioTrack.setVolume(recoveredGain)
          }
          continue
        }

        const prevGain = gainMapRef.current.get(sid) ?? 1
        const desiredGain = TARGET_AUDIO_LEVEL / audioLevel
        const clampedGain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, desiredGain))
        const smoothingFactor =
          clampedGain < prevGain
            ? ATTENUATION_SMOOTHING_FACTOR
            : RECOVERY_SMOOTHING_FACTOR
        const smoothedGain =
          prevGain + smoothingFactor * (clampedGain - prevGain)

        gainMapRef.current.set(sid, smoothedGain)
        touchedTracksRef.current.add(audioTrack)
        audioTrack.setVolume(smoothedGain)
      }
    }, UPDATE_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      resetTouchedTracks()
    }
  }, [enabled, room])
}

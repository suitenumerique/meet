import { useEffect, useRef } from 'react'
import { useRemoteParticipants, useRoomContext } from '@livekit/components-react'
import { RemoteParticipant, RemoteTrackPublication, Track } from 'livekit-client'
import { useSnapshot } from 'valtio'
import { userChoicesStore } from '@/stores/userChoices'

const TARGET_LEVEL = 0.12
const ADAPTATION_RATE = 0.05
const MIN_GAIN = 0.2
const MAX_GAIN = 3.0
const TICK_INTERVAL_MS = 500

interface ParticipantGainState {
  currentGain: number
  smoothedLevel: number
}

/**
 * Adaptive per-participant audio level normalization (issue #1345).
 *
 * Every TICK_INTERVAL_MS, samples each remote participant's audioLevel,
 * smooths it via EMA, and gradually adjusts their audio element volume
 * toward TARGET_LEVEL. Gain is clamped to [MIN_GAIN, MAX_GAIN].
 * Resets all volumes to 1.0 when disabled.
 */
export const useAudioLevelEqualization = () => {
  const room = useRoomContext()
  const remoteParticipants = useRemoteParticipants()
  const { audioLevelEqualizationEnabled } = useSnapshot(userChoicesStore)
  const gainStateRef = useRef<Map<string, ParticipantGainState>>(new Map())

  useEffect(() => {
    if (!audioLevelEqualizationEnabled) {
      for (const participant of room.remoteParticipants.values()) {
        const audioElement = getAudioElement(participant)
        if (audioElement) audioElement.volume = 1.0
      }
      gainStateRef.current.clear()
      return
    }

    const tick = () => {
      for (const participant of room.remoteParticipants.values()) {
        const sid = participant.sid
        const audioLevel = participant.audioLevel ?? 0

        if (!gainStateRef.current.has(sid)) {
          gainStateRef.current.set(sid, { currentGain: 1.0, smoothedLevel: audioLevel })
        }

        const state = gainStateRef.current.get(sid)!

        // EMA to avoid reacting to transient spikes
        state.smoothedLevel =
          state.smoothedLevel * (1 - ADAPTATION_RATE) + audioLevel * ADAPTATION_RATE

        // Only adjust gain when participant is speaking, not on silence/noise floor
        if (state.smoothedLevel > 0.01) {
          const ratio = TARGET_LEVEL / state.smoothedLevel
          state.currentGain =
            state.currentGain * (1 - ADAPTATION_RATE) + ratio * ADAPTATION_RATE
        }

        state.currentGain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, state.currentGain))

        const audioElement = getAudioElement(participant)
        if (audioElement) audioElement.volume = state.currentGain
      }

      // Clean up state for departed participants
      for (const sid of gainStateRef.current.keys()) {
        if (!room.remoteParticipants.has(sid)) {
          gainStateRef.current.delete(sid)
        }
      }
    }

    const intervalId = setInterval(tick, TICK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [audioLevelEqualizationEnabled, room, remoteParticipants])
}

function getAudioElement(participant: RemoteParticipant): HTMLAudioElement | null {
  const micPub = participant.getTrackPublication(
    Track.Source.Microphone
  ) as RemoteTrackPublication | undefined

  if (!micPub?.trackSid) return null

  return document.querySelector<HTMLAudioElement>(
    `audio[data-lk-sid="${micPub.trackSid}"]`
  )
}

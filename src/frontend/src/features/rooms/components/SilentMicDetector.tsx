import { useEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { createAudioAnalyser, LocalAudioTrack } from 'livekit-client'
import { useLocalParticipant } from '@livekit/components-react'
import { reportMicSample, silentMicStore } from '@/stores/silentMic'
import { captureMediaEvent } from '@/features/analytics/telemetry'
import { useIsTrackMuted } from '../livekit/hooks/useIsTrackMuted'

// A live microphone always has a noise floor; only a signal pinned to
// zero counts as silent (no audio data flowing at all).
const SILENT_VOLUME_EPSILON = 0.0001
const TICK_MS = 1_000

type SilentMicContext = 'join' | 'room'

const ActiveDetector = ({
  track,
  context,
}: {
  track: LocalAudioTrack
  context: SilentMicContext
}) => {
  const isMuted = useIsTrackMuted(track)

  // The interval reads through refs so state updates never re-arm the
  // timer or the analyser.
  const mutedRef = useRef(isMuted)
  mutedRef.current = isMuted
  const contextRef = useRef(context)
  contextRef.current = context

  useEffect(() => {
    let audioAnalyser: ReturnType<typeof createAudioAnalyser>
    try {
      audioAnalyser = createAudioAnalyser(track, {
        fftSize: 256,
        smoothingTimeConstant: 0.7,
      })
    } catch {
      void captureMediaEvent('silent-mic-analyser-unavailable', {
        context: contextRef.current,
      })
      return
    }
    const { analyser, calculateVolume, cleanup } = audioAnalyser

    const tick = () => {
      // Zero volume is only evidence of silence when audio data is
      // actually flowing. Skip the sample when:
      //  - the mic is intentionally muted;
      //  - the tab is backgrounded (suspended AudioContext reads as zero);
      //  - the AudioContext is not running yet — Chrome keeps it
      //    'suspended' until a user gesture on pages loaded without
      //    activation, and a suspended analyser reports zeros for a
      //    perfectly healthy microphone.
      if (
        mutedRef.current ||
        document.visibilityState !== 'visible' ||
        analyser.context.state !== 'running'
      ) {
        return
      }
      const result = reportMicSample({
        trackId: track.mediaStreamTrack?.id,
        silent: calculateVolume() <= SILENT_VOLUME_EPSILON,
        deltaMs: TICK_MS,
      })
      if (result === 'silent-detected') {
        void captureMediaEvent('silent-mic-detected', {
          context: contextRef.current,
          media_stream_track_muted: track.mediaStreamTrack?.muted ?? null,
        })
      } else if (result === 'recovered') {
        void captureMediaEvent('silent-mic-recovered', {
          context: contextRef.current,
        })
      }
    }

    const interval = window.setInterval(tick, TICK_MS)
    return () => {
      window.clearInterval(interval)
      void cleanup()
    }
  }, [track])

  return null
}

/**
 * One-shot silent-mic check (see stores/silentMic.ts). Renders nothing;
 * mounts the volume watcher only while the check is still undecided so
 * the analyser goes away as soon as the outcome is known.
 */
export const SilentMicDetector = ({
  track,
  context,
}: {
  track?: LocalAudioTrack
  context: SilentMicContext
}) => {
  const { status } = useSnapshot(silentMicStore)
  if ((status !== 'watching' && status !== 'silent') || !track) {
    return null
  }
  return (
    <ActiveDetector
      key={track.mediaStreamTrack?.id}
      track={track}
      context={context}
    />
  )
}

/** Room-side variant: watches the published local microphone track. */
export const RoomSilentMicDetector = () => {
  const { microphoneTrack } = useLocalParticipant()
  const track =
    microphoneTrack?.track instanceof LocalAudioTrack
      ? microphoneTrack.track
      : undefined
  return <SilentMicDetector track={track} context="room" />
}

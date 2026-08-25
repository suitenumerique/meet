import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  LocalTrackPublication,
  LocalVideoTrack,
  ParticipantEvent,
  Track,
  TrackEvent,
} from 'livekit-client'
import { useSnapshot } from 'valtio'
import { reportError } from '@/features/analytics/telemetry'
import {
  disablePerformanceMode,
  performanceModeStore,
} from '@/stores/performanceMode'
import { degradeVideoTrack, restoreVideoTrack } from '../degradation'

/** Delay to re-apply degradation after restart to avoid racing LiveKit's encoding recompute. */
const REAPPLY_AFTER_RESTART_MS = 1_000

/** Syncs performance mode store state to outbound camera track encoding settings. */
export const PerformanceModeController = () => {
  const room = useRoomContext()
  const { enabled } = useSnapshot(performanceModeStore)

  // Manage degradation application and track lifecycle events
  useEffect(() => {
    const localParticipant = room.localParticipant

    const getCameraTrack = () => {
      const pub = localParticipant.getTrackPublication(Track.Source.Camera)
      return pub?.track instanceof LocalVideoTrack ? pub.track : null
    }

    const track = getCameraTrack()

    // Restore track quality if performance mode is disabled
    if (!enabled) {
      if (track) {
        restoreVideoTrack(track).catch((err) =>
          reportError('performance_mode_failure', err, { action: 'restore' })
        )
      }
      return
    }

    const applyDegradation = (t: LocalVideoTrack, action = 'degrade') => {
      degradeVideoTrack(t).catch((err) =>
        reportError('performance_mode_failure', err, { action })
      )
    }

    // Re-apply degradation after track restarts (e.g. device/resolution changes)
    const watchTrackRestart = (t: LocalVideoTrack) => {
      let timeoutId: ReturnType<typeof setTimeout>
      const onRestarted = () => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          if (performanceModeStore.enabled) applyDegradation(t, 'reapply')
        }, REAPPLY_AFTER_RESTART_MS)
      }
      t.on(TrackEvent.Restarted, onRestarted)
      return () => {
        clearTimeout(timeoutId)
        t.off(TrackEvent.Restarted, onRestarted)
      }
    }

    let unwatchRestart: (() => void) | undefined

    if (track) {
      applyDegradation(track)
      unwatchRestart = watchTrackRestart(track)
    }

    // Apply degradation to newly published camera tracks
    const handlePublished = (pub: LocalTrackPublication) => {
      if (
        pub.source === Track.Source.Camera &&
        pub.track instanceof LocalVideoTrack
      ) {
        unwatchRestart?.()
        applyDegradation(pub.track)
        unwatchRestart = watchTrackRestart(pub.track)
      }
    }
    localParticipant.on(ParticipantEvent.LocalTrackPublished, handlePublished)

    return () => {
      localParticipant.off(
        ParticipantEvent.LocalTrackPublished,
        handlePublished
      )
      unwatchRestart?.()
    }
  }, [room, enabled])

  // Reset auto (CPU-triggered) performance mode on unmount/leave room
  useEffect(() => {
    return () => {
      if (performanceModeStore.trigger === 'cpu') {
        disablePerformanceMode()
      }
    }
  }, [])

  return null
}

import { useEffect, useRef } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  LocalTrackPublication,
  LocalVideoTrack,
  ParticipantEvent,
  Track,
} from 'livekit-client'

import { captureEvent } from '@/features/analytics/telemetry'
import { collectHardwareSnapshot } from '@/features/analytics/hardware'
import { notifyCpuConstrained } from '@/features/notifications/utils'
import { isFireFox } from '@/utils/livekit'
import {
  enablePerformanceMode,
  performanceModeStore,
} from '@/stores/performanceMode'

export const CpuConstrainedObserver = () => {
  const room = useRoomContext()
  const degradedTracksRef = useRef(new WeakSet<LocalVideoTrack>())

  useEffect(() => {
    const localParticipant = room.localParticipant

    const handleCpuConstrained = (
      track: LocalVideoTrack,
      publication: LocalTrackPublication
    ) => {
      const { enabled, userDeclinedAuto } = performanceModeStore

      const shouldDegrade =
        publication.source === Track.Source.Camera &&
        !enabled &&
        !userDeclinedAuto &&
        !degradedTracksRef.current.has(track)

      void collectHardwareSnapshot().then((hardware) => {
        captureEvent('cpu-constrained', {
          firefox: isFireFox(),
          source: publication.source,
          degraded: shouldDegrade,
          trackOptions: publication.options,
          performance_mode_enabled: enabled,
          user_declined_auto: userDeclinedAuto,
          ...hardware,
        })
      })

      if (!shouldDegrade) return
      degradedTracksRef.current.add(track)

      enablePerformanceMode('cpu')
      notifyCpuConstrained()
    }

    localParticipant.on(
      ParticipantEvent.LocalTrackCpuConstrained,
      handleCpuConstrained
    )

    return () => {
      localParticipant.off(
        ParticipantEvent.LocalTrackCpuConstrained,
        handleCpuConstrained
      )
    }
  }, [room])

  return null
}

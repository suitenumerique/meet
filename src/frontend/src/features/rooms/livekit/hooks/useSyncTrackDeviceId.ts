import { useEffect } from 'react'
import { TrackEvent, type LocalTrack } from 'livekit-client'

/**
 * Keeps the persisted preference aligned with the track's actual device.
 * The track is the source of truth, not the store.
 *
 * Syncs on mount and TrackEvent.Restarted, covering acquisition/restart,
 * setDeviceId switches, unmute re-acquisition, and browser fallback.
 *
 * Skip persisting the raw "default" alias: it means "follow the OS default"
 * and resolving it would pin the preference to a concrete device.
 */
export const useSyncTrackDeviceId = (
  track: LocalTrack | undefined,
  save: (deviceId: string) => void
) => {
  useEffect(() => {
    if (!track) return
    let cancelled = false
    const sync = () => {
      track
        .getDeviceId(false)
        .then((deviceId) => {
          if (!cancelled && deviceId) {
            save(deviceId)
          }
        })
        .catch(() => {
          // A track without settings (ended, screen share) has no id to sync.
        })
    }
    sync()
    track.on(TrackEvent.Restarted, sync)
    return () => {
      cancelled = true
      track.off(TrackEvent.Restarted, sync)
    }
  }, [track, save])
}

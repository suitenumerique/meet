import { useEffect } from 'react'
import { TrackEvent, type LocalTrack } from 'livekit-client'

/**
 * Keeps the persisted device preference aligned with the device the track
 * is ACTUALLY using — the track is the ground truth, not the store.
 *
 * Syncs on mount and on every TrackEvent.Restarted, which covers all the
 * moments the underlying device can change on the join screen:
 *  - initial acquisition where LiveKit resolved the 'default' alias
 *    (getDeviceId(normalize=true) resolves it to the concrete id via
 *    livekit's DeviceManager — this replaces the former
 *    useResolveInitiallyDefaultDeviceId, which never fired after init),
 *  - a device switch via setDeviceId,
 *  - an unmute re-acquisition,
 *  - the browser falling back to another device.
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
        .getDeviceId()
        .then((deviceId) => {
          if (!cancelled && deviceId && deviceId !== 'default') {
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

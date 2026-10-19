import { type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client'
import { reportError } from '@/features/analytics/telemetry'

export type PreviewTrack = LocalAudioTrack | LocalVideoTrack

/**
 * Toggle a join screen preview track. Resolves to the enabled state the
 * track ends in, so a failed mute or unmute resolves to the initial state.
 */
export const toggleTrack =
  (enabled: boolean, save: (v: boolean) => void, track?: PreviewTrack) =>
  async () => {
    save(!enabled)
    try {
      await (enabled ? track?.mute() : track?.unmute())
      return !enabled
    } catch (err) {
      save(enabled)
      reportError('join_preview_failure', err as Error, {
        path: 'join_preview',
      })
      return enabled
    }
  }

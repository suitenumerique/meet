import { LocalVideoTrack } from 'livekit-client'
import { isFireFox } from '@/utils/livekit'

/** Target degraded encoding for layer 0 (~360p @ 15fps, ≤300kbps). */
export const DEGRADED_MAX_HEIGHT = 360
export const DEGRADED_MAX_FRAMERATE = 15
export const DEGRADED_MAX_BITRATE = 300_000

/**
 * Firefox ignores `active = false` on RTCRtpSender.
 * We starve higher layers using LiveKit's sentinel workaround values instead.
 */
const FF_DISABLED_SCALE_DOWN = 4
const FF_DISABLED_MAX_BITRATE = 10
const FF_DISABLED_MAX_FRAMERATE = 2

type SavedEncoding = Pick<
  RTCRtpEncodingParameters,
  'active' | 'scaleResolutionDownBy' | 'maxBitrate' | 'maxFramerate'
>

/** Pre-degradation encoding snapshots keyed by track to prevent leaks. */
const savedEncodingsByTrack = new WeakMap<LocalVideoTrack, SavedEncoding[]>()

export const isTrackDegraded = (track: LocalVideoTrack) =>
  savedEncodingsByTrack.has(track)

/**
 * Revertibly degrades local video quality without unpublishing.
 * Avoids `prioritizePerformance()` because its internal flag disables dynacast permanently.
 *
 * - Layer 0: Capped to 360p / 15fps / 300kbps.
 * - Other layers: Set to `active: false` (or starved on Firefox).
 */
export const degradeVideoTrack = async (track: LocalVideoTrack) => {
  const sender = track.sender
  if (!sender) {
    throw new Error('sender not found')
  }

  const params = sender.getParameters()
  if (!params.encodings || params.encodings.length === 0) {
    return
  }

  // Snapshot once so re-applications don't overwrite pristine encodings
  if (!savedEncodingsByTrack.has(track)) {
    savedEncodingsByTrack.set(
      track,
      params.encodings.map((e) => ({
        active: e.active,
        scaleResolutionDownBy: e.scaleResolutionDownBy,
        maxBitrate: e.maxBitrate,
        maxFramerate: e.maxFramerate,
      }))
    )
  }

  const captureHeight =
    track.mediaStreamTrack.getSettings().height ?? DEGRADED_MAX_HEIGHT

  params.encodings = params.encodings.map((encoding, idx) => {
    if (idx === 0) {
      return {
        ...encoding,
        active: true,
        scaleResolutionDownBy: Math.max(
          1,
          Math.ceil(captureHeight / DEGRADED_MAX_HEIGHT)
        ),
        maxFramerate: DEGRADED_MAX_FRAMERATE,
        maxBitrate: Math.min(
          encoding.maxBitrate ?? DEGRADED_MAX_BITRATE,
          DEGRADED_MAX_BITRATE
        ),
      }
    }

    if (isFireFox()) {
      const starved: RTCRtpEncodingParameters = {
        ...encoding,
        // Firefox workaround: active=false prevents LiveKit re-encodes, while starved values limit bitrate
        active: false,
        scaleResolutionDownBy: FF_DISABLED_SCALE_DOWN,
        maxBitrate: FF_DISABLED_MAX_BITRATE,
        maxFramerate: FF_DISABLED_MAX_FRAMERATE,
      }
      // LiveKit legacy property fallback for Firefox
      ;(starved as Record<string, unknown>).maxFrameRate =
        FF_DISABLED_MAX_FRAMERATE
      return starved
    }

    return { ...encoding, active: false }
  })

  await sender.setParameters(params)
}

/** Restores encodings captured prior to degradation. */
export const restoreVideoTrack = async (track: LocalVideoTrack) => {
  const saved = savedEncodingsByTrack.get(track)
  savedEncodingsByTrack.delete(track)

  const sender = track.sender
  if (!saved || !sender) {
    return
  }

  const params = sender.getParameters()
  if (!params.encodings || params.encodings.length !== saved.length) {
    return
  }

  params.encodings = params.encodings.map((encoding, idx) => {
    const restored: RTCRtpEncodingParameters = {
      ...encoding,
      ...saved[idx],
    }
    // Clean up Firefox legacy property if set during degradation
    ;(restored as Record<string, unknown>).maxFrameRate = undefined
    return restored
  })

  await sender.setParameters(params)
}

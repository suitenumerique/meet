import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSnapshot } from 'valtio'
import { usePreviewTracks } from '@livekit/components-react'
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  MediaDeviceFailure,
  Track,
} from 'livekit-client'
import { BackgroundProcessorFactory } from '../components/blur'
import {
  notePermissionDeniedFromGum,
  type PermissionKind,
} from '@/stores/permissions'
import { reportError } from '@/features/analytics/telemetry'
import {
  type LocalUserChoices,
  saveAudioInputDeviceId,
  saveVideoInputDeviceId,
  userChoicesStore,
} from '@/stores/userChoices'
import { useSyncTrackDeviceId } from './useSyncTrackDeviceId'

/**
 * Audio capture constraints tuned for voice calls:
 * 48 kHz / 16-bit is plenty for speech, mono halves the bandwidth.
 */
const VOICE_AUDIO_CONSTRAINTS = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceIsolation: false,
  sampleRate: 48000,
  channelCount: 1,
  sampleSize: 16,
} as const

export const onJoinPreviewError = (e: Error, kind?: PermissionKind) => {
  reportError('join_preview_failure', e, { path: 'join_preview' })
  if (
    MediaDeviceFailure.getFailure(e) === MediaDeviceFailure.PermissionDenied
  ) {
    notePermissionDeniedFromGum(kind)
  }
}

/**
 * Just-in-time track acquisition: creates a local track only when the user
 * enables a device that was disabled on mount (so no preview track exists
 * for it). Handles the async race on unmount/deps-change and stops the
 * track when it is replaced or the owner unmounts.
 */
function useDynamicTrack<T extends LocalAudioTrack | LocalVideoTrack>({
  enabled,
  initiallyEnabled,
  previewTrack,
  create,
  permissionKind,
}: {
  enabled: boolean
  initiallyEnabled: boolean
  previewTrack: T | undefined
  create: () => Promise<T>
  permissionKind: PermissionKind
}): T | null {
  const [track, setTrack] = useState<T | null>(null)

  useEffect(() => {
    if (!enabled || initiallyEnabled || previewTrack || track) {
      return
    }
    let cancelled = false
    create()
      .then((newTrack) => {
        if (cancelled) {
          // Resolved after unmount or after deps changed: release the device
          // instead of leaking an orphaned track.
          newTrack.stop()
          return
        }
        setTrack(newTrack)
      })
      .catch((error) => onJoinPreviewError(error as Error, permissionKind))
    return () => {
      cancelled = true
    }
  }, [enabled, initiallyEnabled, previewTrack, track, create, permissionKind])

  // Stop the track when it is replaced or on unmount.
  useEffect(() => {
    return () => {
      track?.stop()
    }
  }, [track])

  return track
}

/**
 * Owns every track concern of the Join screen:
 *
 * - requests preview tracks for the devices enabled when the screen mounted
 * - lazily acquires a track when the user enables a device afterwards
 *   (dynamic tracks take precedence over preview tracks)
 * - reports acquisition failures and permission denials
 * - keeps the persisted device ids in sync with the active tracks
 *
 * Returns the tracks to render/toggle. Either can be undefined while
 * acquisition is pending or when the device is disabled.
 */
export function useJoinTracks(): {
  audioTrack: LocalAudioTrack | undefined
  videoTrack: LocalVideoTrack | undefined
} {
  const {
    audioEnabled,
    videoEnabled,
    audioDeviceId,
    videoDeviceId,
    processorConfig,
  } = useSnapshot(userChoicesStore)

  // Snapshot of the user's choices at mount time. Preview tracks are only
  // requested for devices enabled at that point; anything enabled later
  // goes through the dynamic path. useState's lazy initializer captures
  // this exactly once, with no ref-mutation-during-render.
  const [initialChoices] = useState<LocalUserChoices>(() => ({
    audioEnabled: userChoicesStore.audioEnabled,
    videoEnabled: userChoicesStore.videoEnabled,
    audioDeviceId: userChoicesStore.audioDeviceId,
    audioOutputDeviceId: userChoicesStore.audioOutputDeviceId,
    videoDeviceId: userChoicesStore.videoDeviceId,
    processorConfig: userChoicesStore.processorConfig,
  }))

  const tracks = usePreviewTracks(
    {
      audio: initialChoices.audioEnabled && {
        deviceId: initialChoices.audioDeviceId,
      },
      video: initialChoices.videoEnabled && {
        deviceId: initialChoices.videoDeviceId,
        processor: BackgroundProcessorFactory.fromProcessorConfig(
          initialChoices.processorConfig
        ),
      },
    },
    onJoinPreviewError
  )

  const previewVideoTrack = useMemo(
    () =>
      tracks?.find(
        (track): track is LocalVideoTrack => track.kind === Track.Kind.Video
      ),
    [tracks]
  )

  const previewAudioTrack = useMemo(
    () =>
      tracks?.find(
        (track): track is LocalAudioTrack => track.kind === Track.Kind.Audio
      ),
    [tracks]
  )

  const createVideo = useCallback(
    () =>
      createLocalVideoTrack({
        deviceId: videoDeviceId,
        processor:
          BackgroundProcessorFactory.fromProcessorConfig(processorConfig),
      }),
    [videoDeviceId, processorConfig]
  )

  const createAudio = useCallback(
    () =>
      createLocalAudioTrack({
        deviceId: audioDeviceId,
        ...VOICE_AUDIO_CONSTRAINTS,
      }),
    [audioDeviceId]
  )

  const dynamicVideoTrack = useDynamicTrack({
    enabled: videoEnabled,
    initiallyEnabled: initialChoices.videoEnabled,
    previewTrack: previewVideoTrack,
    create: createVideo,
    permissionKind: 'camera',
  })

  const dynamicAudioTrack = useDynamicTrack({
    enabled: audioEnabled,
    initiallyEnabled: initialChoices.audioEnabled,
    previewTrack: previewAudioTrack,
    create: createAudio,
    permissionKind: 'microphone',
  })

  // Dynamic tracks take precedence over preview tracks.
  const videoTrack = dynamicVideoTrack ?? previewVideoTrack
  const audioTrack = dynamicAudioTrack ?? previewAudioTrack

  // Keep persisted device ids in sync with what the tracks actually use.
  useSyncTrackDeviceId(audioTrack, saveAudioInputDeviceId)
  useSyncTrackDeviceId(videoTrack, saveVideoInputDeviceId)

  return { audioTrack, videoTrack }
}

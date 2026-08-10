import { useCallback, useEffect, useRef, useState } from 'react'
import { useSnapshot } from 'valtio'
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  MediaDeviceFailure,
  TrackEvent,
} from 'livekit-client'
import { BackgroundProcessorFactory } from '../components/blur'
import {
  notePermissionDeniedFromGum,
  type PermissionKind,
} from '@/stores/permissions'
import { captureMediaEvent, reportError } from '@/features/analytics/telemetry'
import {
  saveAudioInputDeviceId,
  saveAudioInputEnabled,
  saveVideoInputDeviceId,
  saveVideoInputEnabled,
  userChoicesStore,
} from '@/stores/userChoices'
import { useSyncTrackDeviceId } from './useSyncTrackDeviceId'

const VOICE_AUDIO_CONSTRAINTS = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceIsolation: false,
  sampleRate: 48000,
  channelCount: 1,
  sampleSize: 16,
} as const

const PERMISSION_KIND: Record<'audioinput' | 'videoinput', PermissionKind> = {
  audioinput: 'microphone',
  videoinput: 'camera',
}

export const onJoinPreviewError = (e: Error, kind?: PermissionKind) => {
  if (
    MediaDeviceFailure.getFailure(e) === MediaDeviceFailure.PermissionDenied
  ) {
    notePermissionDeniedFromGum(kind)
    captureMediaEvent('permissions-denied', { path: 'join_preview', kind })
    return
  }

  if (MediaDeviceFailure.getFailure(e) === MediaDeviceFailure.NotFound) {
    captureMediaEvent('device-not-found', { path: 'join_preview', kind })
    return
  }

  // "Other" and "Device in use" are still reported as errors, as they are not handled on the join screen.
  reportError('join_preview_failure', e, { path: 'join_preview', kind })
}

// Module-level: effect dependencies, must be referentially stable.
const disableAudio = () => saveAudioInputEnabled(false)
const disableVideo = () => saveVideoInputEnabled(false)

const stopAll = (stream: MediaStream) =>
  stream.getTracks().forEach((track) => track.stop())

export const requestDevicePermission = async (
  kind: 'audioinput' | 'videoinput'
): Promise<boolean> => {
  try {
    const track =
      kind === 'audioinput'
        ? await createLocalAudioTrack()
        : await createLocalVideoTrack()
    track.stop()
    return true
  } catch (error) {
    onJoinPreviewError(error as Error, PERMISSION_KIND[kind])
    return false
  }
}

/**
 * Requests camera and microphone once on mount (one combined call → at
 * most one browser dialog) and releases them immediately. Returns true
 * once settled; track acquisition must wait for it to avoid a second
 * dialog.
 */
function useWarmupPermissions(): boolean {
  const [done, setDone] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true

    const warmup = async () => {
      try {
        stopAll(
          await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          })
        )
      } catch (error) {
        if (
          MediaDeviceFailure.getFailure(error as Error) ===
          MediaDeviceFailure.PermissionDenied
        ) {
          // Retrying after a dismissal would show a second dialog.
          onJoinPreviewError(error as Error)
          return
        }
        // Combined requests fail atomically (e.g. missing webcam fails the
        // mic too) — retry per kind; permission is settled, no dialog risk.
        try {
          stopAll(await navigator.mediaDevices.getUserMedia({ audio: true }))
        } catch (e) {
          onJoinPreviewError(e as Error, 'microphone')
        }
        try {
          stopAll(await navigator.mediaDevices.getUserMedia({ video: true }))
        } catch (e) {
          onJoinPreviewError(e as Error, 'camera')
        }
      } finally {
        setDone(true)
      }
    }
    warmup()
  }, [])

  return done
}

function useLocalTrack<T extends LocalAudioTrack | LocalVideoTrack>({
  ready,
  enabled,
  create,
  permissionKind,
  onFailure,
}: {
  ready: boolean
  enabled: boolean
  create: () => Promise<T>
  permissionKind: PermissionKind
  onFailure: () => void
}): T | null {
  const [track, setTrack] = useState<T | null>(null)

  // Acquire.
  useEffect(() => {
    if (!ready || !enabled || track) {
      return
    }
    let cancelled = false
    create()
      .then((newTrack) => {
        if (cancelled) {
          newTrack.stop()
          return
        }
        setTrack(newTrack)
      })
      .catch((error) => {
        onJoinPreviewError(error as Error, permissionKind)
        onFailure()
      })
    return () => {
      cancelled = true
    }
  }, [ready, enabled, track, create, permissionKind, onFailure])

  // Release on toggle-off so the LED turns off.
  useEffect(() => {
    if (!enabled && track) {
      track.stop()
      setTrack(null)
    }
  }, [enabled, track])

  // Track ended externally (permission revoked, device unplugged):
  // disable instead of re-acquiring, so no unsolicited dialog.
  useEffect(() => {
    if (!track) {
      return
    }
    const handleEnded = () => {
      setTrack(null)
      onFailure()
    }
    track.on(TrackEvent.Ended, handleEnded)
    return () => {
      track.off(TrackEvent.Ended, handleEnded)
    }
  }, [track, onFailure])

  // Release on unmount or replacement.
  useEffect(() => {
    return () => {
      track?.stop()
    }
  }, [track])

  return track
}

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

  const ready = useWarmupPermissions()

  const createAudio = useCallback(
    () =>
      createLocalAudioTrack({
        deviceId: audioDeviceId,
        ...VOICE_AUDIO_CONSTRAINTS,
      }),
    [audioDeviceId]
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

  const audioTrack = useLocalTrack({
    ready,
    enabled: audioEnabled,
    create: createAudio,
    permissionKind: 'microphone',
    onFailure: disableAudio,
  })

  const videoTrack = useLocalTrack({
    ready,
    enabled: videoEnabled,
    create: createVideo,
    permissionKind: 'camera',
    onFailure: disableVideo,
  })

  useSyncTrackDeviceId(audioTrack ?? undefined, saveAudioInputDeviceId)
  useSyncTrackDeviceId(videoTrack ?? undefined, saveVideoInputDeviceId)

  return {
    audioTrack: audioTrack ?? undefined,
    videoTrack: videoTrack ?? undefined,
  }
}

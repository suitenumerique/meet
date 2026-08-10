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
  classifyPermissionError,
  isLikelySystemNotFound,
  isSystemPermissionError,
  noteGumSuccess,
  notePermissionDeniedFromGum,
  noteSystemPermissionDenied,
  type PermissionKind,
} from '@/stores/permissions'
import { getOS } from '@/utils/os'
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
    void classifyPermissionError(e, kind).then((scope) => {
      if (scope === 'system') {
        noteSystemPermissionDenied(kind)
      } else {
        notePermissionDeniedFromGum(kind)
      }
      captureMediaEvent('permissions-denied', {
        path: 'join_preview',
        kind,
        denied_scope: scope,
        os: getOS(),
      })
    })
    return
  }

  if (MediaDeviceFailure.getFailure(e) === MediaDeviceFailure.NotFound) {
    // Firefox reports OS-level blocks as NotFoundError (macOS privacy
    // settings, missing Android app permissions).
    void isLikelySystemNotFound(e, kind).then((system) => {
      if (system) {
        noteSystemPermissionDenied(kind)
        captureMediaEvent('permissions-denied', {
          path: 'join_preview',
          kind,
          denied_scope: 'system',
          os: getOS(),
        })
        return
      }
      captureMediaEvent('device-not-found', { path: 'join_preview', kind })
    })
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
    noteGumSuccess(PERMISSION_KIND[kind])
    return true
  } catch (error) {
    onJoinPreviewError(error as Error, PERMISSION_KIND[kind])
    return false
  }
}

type WarmupState = {
  audioReady: boolean
  videoReady: boolean
}

/**
 * Requests camera and microphone once on mount (one combined call → at
 * most one browser dialog) and releases them immediately. Readiness is
 * per kind: track acquisition must wait for its own kind to be settled
 * to avoid a second dialog, but a microphone that stalls or fails (e.g.
 * OS-level block on Firefox) must not hold the camera hostage — that is
 * how LiveKit behaves in-room (independent per-kind acquisitions).
 */
function useWarmupPermissions(): WarmupState {
  const [state, setState] = useState<WarmupState>({
    audioReady: false,
    videoReady: false,
  })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true

    const bothReady = () => setState({ audioReady: true, videoReady: true })

    const warmup = async () => {
      try {
        stopAll(
          await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          })
        )
        noteGumSuccess()
        bothReady()
      } catch (error) {
        if (
          MediaDeviceFailure.getFailure(error as Error) ===
            MediaDeviceFailure.PermissionDenied &&
          !isSystemPermissionError(error)
        ) {
          // Retrying after a dismissal would show a second dialog.
          onJoinPreviewError(error as Error)
          bothReady()
          return
        }
        // Combined requests fail atomically (e.g. missing webcam fails the
        // mic too, and an OS-level block on one device fails both) — retry
        // per kind to know which device is affected; permission is settled
        // at the browser level, no dialog risk. The retries run in parallel
        // and settle readiness independently.
        void navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            stopAll(stream)
            noteGumSuccess('microphone')
          })
          .catch((e) => onJoinPreviewError(e as Error, 'microphone'))
          .finally(() =>
            setState((current) => ({ ...current, audioReady: true }))
          )
        void navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            stopAll(stream)
            noteGumSuccess('camera')
          })
          .catch((e) => onJoinPreviewError(e as Error, 'camera'))
          .finally(() =>
            setState((current) => ({ ...current, videoReady: true }))
          )
      }
    }
    warmup()
  }, [])

  return state
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
        noteGumSuccess(permissionKind)
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

  const { audioReady, videoReady } = useWarmupPermissions()

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
    ready: audioReady,
    enabled: audioEnabled,
    create: createAudio,
    permissionKind: 'microphone',
    onFailure: disableAudio,
  })

  const videoTrack = useLocalTrack({
    ready: videoReady,
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

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
  isSystemPermissionError,
  type PermissionKind,
} from '@/stores/permissions'
import {
  getMediaDeviceFailure,
  noteDeviceReady,
  onMediaPermissionError,
} from '../utils/mediaPermissions'
import { VOICE_AUDIO_CONSTRAINTS } from '../utils/constants'
import {
  saveAudioInputDeviceId,
  saveAudioInputEnabled,
  saveVideoInputDeviceId,
  saveVideoInputEnabled,
  userChoicesStore,
} from '@/stores/userChoices'
import { useSyncTrackDeviceId } from './useSyncTrackDeviceId'

// Module-level: effect dependencies, must be referentially stable.
const disableAudio = () => saveAudioInputEnabled(false)
const disableVideo = () => saveVideoInputEnabled(false)

const stopAll = (stream: MediaStream) =>
  stream.getTracks().forEach((track) => track.stop())

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
        noteDeviceReady()
        bothReady()
      } catch (error) {
        if (
          getMediaDeviceFailure(error as Error) ===
            MediaDeviceFailure.PermissionDenied &&
          !isSystemPermissionError(error)
        ) {
          // Retrying after a dismissal would show a second dialog.
          onMediaPermissionError(error as Error)
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
            noteDeviceReady('microphone')
          })
          .catch((e) => onMediaPermissionError(e as Error, 'microphone'))
          .finally(() =>
            setState((current) => ({ ...current, audioReady: true }))
          )
        void navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            stopAll(stream)
            noteDeviceReady('camera')
          })
          .catch((e) => onMediaPermissionError(e as Error, 'camera'))
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
  deviceId,
  onFailure,
}: {
  ready: boolean
  enabled: boolean
  create: () => Promise<T>
  permissionKind: PermissionKind
  deviceId?: string
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
        noteDeviceReady(permissionKind)
        setTrack(newTrack)
      })
      .catch((error) => {
        if (cancelled) return
        onMediaPermissionError(
          error as Error,
          permissionKind,
          'join_preview',
          deviceId
        )
        onFailure()
      })
    return () => {
      cancelled = true
    }
  }, [ready, enabled, track, create, permissionKind, deviceId, onFailure])

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
    deviceId: audioDeviceId,
    onFailure: disableAudio,
  })

  const videoTrack = useLocalTrack({
    ready: videoReady,
    enabled: videoEnabled,
    create: createVideo,
    permissionKind: 'camera',
    deviceId: videoDeviceId,
    onFailure: disableVideo,
  })

  useSyncTrackDeviceId(audioTrack ?? undefined, saveAudioInputDeviceId)
  useSyncTrackDeviceId(videoTrack ?? undefined, saveVideoInputDeviceId)

  return {
    audioTrack: audioTrack ?? undefined,
    videoTrack: videoTrack ?? undefined,
  }
}

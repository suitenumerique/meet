import {
  AudioCaptureOptions,
  createLocalTracks,
  CreateLocalTracksOptions,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  Mutex,
  Track,
  VideoCaptureOptions,
} from 'livekit-client'
import { useEffect, useMemo, useRef, useState } from 'react'

function roomOptionsStringifyReplacer(key: string, val: unknown) {
  if (key === 'processor') {
    return undefined
  }
  if (key === 'e2ee' && val) {
    return 'e2ee-enabled'
  }
  return val
}

export function usePreviewTracks(
  options: CreateLocalTracksOptions,
  onError?: (err: Error) => void
) {
  const trackLock = useMemo(() => {
    return new Mutex()
  }, [])

  const videoTrackLock = useMemo(() => {
    return new Mutex()
  }, [])

  const audioTrackLock = useMemo(() => {
    return new Mutex()
  }, [])

  const isInitiated = useRef(false)

  const videoTrackRef = useRef<LocalVideoTrack | undefined>()
  const audioTrackRef = useRef<LocalAudioTrack | undefined>()

  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | undefined>()
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | undefined>()

  const extractTracks = (tracks: LocalTrack[]) => {
    const video = tracks.find(
      (track): track is LocalVideoTrack => track.kind === Track.Kind.Video
    )
    const audio = tracks.find(
      (track): track is LocalAudioTrack => track.kind === Track.Kind.Audio
    )

    return { video, audio }
  }

  useEffect(() => {
    if (isInitiated.current) {
      return
    }
    let needsCleanup = false
    let localTracks: Array<LocalTrack> = []
    trackLock.lock().then(async (unlock) => {
      try {
        if (options.audio || options.video) {
          localTracks = await createLocalTracks(options)

          if (needsCleanup) {
            localTracks.forEach((tr) => tr.stop())
          } else {
            const { audio, video } = extractTracks(localTracks)
            isInitiated.current = true
            setVideoTrack(video)
            videoTrackRef.current = video
            setAudioTrack(audio)
            audioTrackRef.current = audio
          }
        }
      } catch (e: unknown) {
        if (onError && e instanceof Error) {
          onError(e)
        } else {
          console.error(e)
        }
      } finally {
        unlock()
      }
    })

    return () => {
      if (isInitiated.current) {
        return
      }
      needsCleanup = true
      localTracks.forEach((track) => {
        track.stop()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(options, roomOptionsStringifyReplacer),
    onError,
    trackLock,
  ])

  const videoOptions = options?.video

  useEffect(() => {
    if (!isInitiated.current) {
      return
    }
    videoTrackLock.lock().then(async (unlock) => {
      try {
        if (!videoOptions) return
        await videoTrackRef.current?.restartTrack(
          videoOptions as VideoCaptureOptions
        )
      } catch (e: unknown) {
        if (onError && e instanceof Error) {
          onError(e)
        } else {
          console.error(e)
        }
      } finally {
        unlock()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(videoOptions, roomOptionsStringifyReplacer),
    onError,
    videoTrackLock,
  ])

  const audioOptions = options?.audio

  useEffect(() => {
    if (!isInitiated.current) {
      return
    }
    audioTrackLock.lock().then(async (unlock) => {
      try {
        if (!audioOptions) return
        await audioTrackRef.current?.restartTrack(
          audioOptions as AudioCaptureOptions
        )
      } catch (e: unknown) {
        if (onError && e instanceof Error) {
          onError(e)
        } else {
          console.error(e)
        }
      } finally {
        unlock()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(audioOptions, roomOptionsStringifyReplacer),
    onError,
    audioTrackLock,
  ])

  return {
    videoTrack,
    audioTrack,
  }
}

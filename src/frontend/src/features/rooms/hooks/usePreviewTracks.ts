import {
  createLocalTracks,
  CreateLocalTracksOptions,
  LocalTrack,
  LocalVideoTrack,
  Mutex,
  Track,
} from 'livekit-client'
import { useEffect, useMemo, useState } from 'react'

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
  const [tracks, setTracks] = useState<LocalTrack[]>()

  const trackLock = useMemo(() => new Mutex(), [])
  const videoTrack = useMemo(
    () =>
      tracks?.filter(
        (track) => track.kind === Track.Kind.Video
      )[0] as LocalVideoTrack,
    [tracks]
  )

  const audioTrack = useMemo(
    () =>
      tracks?.filter(
        (track) => track.kind === Track.Kind.Audio
      )[0] as LocalVideoTrack,
    [tracks]
  )

  useEffect(() => {
    let needsCleanup = false
    let localTracks: Array<LocalTrack> = []
    trackLock.lock().then(async (unlock) => {
      try {
        if (options.audio || options.video) {
          localTracks = await createLocalTracks(options)

          if (needsCleanup) {
            localTracks.forEach((tr) => tr.stop())
          } else {
            setTracks(localTracks)
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
      needsCleanup = true
      localTracks.forEach((track) => {
        track.stop()
      })
    }
  }, [
    JSON.stringify(options, roomOptionsStringifyReplacer),
    onError,
    trackLock,
  ])

  return { videoTrack, audioTrack }
}

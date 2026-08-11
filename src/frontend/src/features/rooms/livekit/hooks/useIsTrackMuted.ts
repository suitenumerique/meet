import { type LocalAudioTrack, TrackEvent } from 'livekit-client'
import { useEffect, useState } from 'react'

export const useIsTrackMuted = (track?: LocalAudioTrack) => {
  const [isMuted, setIsMuted] = useState(() => track?.isMuted ?? true)

  useEffect(() => {
    if (!track) {
      setIsMuted(true)
      return
    }
    setIsMuted(track.isMuted)
    const onMuted = () => setIsMuted(true)
    const onUnmuted = () => setIsMuted(false)
    track.on(TrackEvent.Muted, onMuted)
    track.on(TrackEvent.Unmuted, onUnmuted)
    return () => {
      track.off(TrackEvent.Muted, onMuted)
      track.off(TrackEvent.Unmuted, onUnmuted)
    }
  }, [track])

  return isMuted
}

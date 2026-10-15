import { RoomEvent } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useEffect, useState } from 'react'

/**
 * Identity of the loudest remote speaker, kept through silence until another
 * remote participant speaks. Re-renders only when that identity changes.
 */
export function useLastRemoteSpeaker() {
  const room = useRoomContext()
  const [identity, setIdentity] = useState<string>()

  useEffect(() => {
    const onActiveSpeakersChanged = (speakers: Participant[]) => {
      const loudest = speakers.find((speaker) => !speaker.isLocal)
      if (loudest) {
        setIdentity(loudest.identity)
      }
    }
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    }
  }, [room])

  return identity
}

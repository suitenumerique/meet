import { useEffect, useMemo, useRef } from 'react'
import {
  useConnectionState,
  useRemoteParticipants,
  useRoomContext,
  useRoomInfo,
} from '@livekit/components-react'
import {
  ConnectionState,
  RoomEvent,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from 'livekit-client'
import { allowedListeners, inSameBreakoutRoom, readSplit } from '../utils/split'

// Keeps this browser's audio and video inside its breakout room. The media server
// refuses anyone a publisher does not list, whatever their browser does.
// restrictedBeforeConnect: Conference listed nobody before connecting.
export const useBreakoutMediaPermissions = (
  restrictedBeforeConnect: boolean
) => {
  const room = useRoomContext()
  const state = useConnectionState()
  const { metadata } = useRoomInfo()
  // The lists rest on who is here and their kind, never on what they do.
  const remotes = useRemoteParticipants({ updateOnlyOn: [] })

  // Who may receive this browser, as JSON so the effect below runs only when
  // the list itself changes: undefined while not connected, "null" for
  // everyone. Read from the room itself: the hooks above only say when to
  // look again.
  const listenersKey = useMemo(() => {
    if (state !== ConnectionState.Connected) return undefined
    const listeners = allowedListeners(
      readSplit(room.metadata),
      room.localParticipant.identity,
      remotes
    )
    return JSON.stringify(
      listeners && [...listeners].sort((a, b) => a.localeCompare(b))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, state, metadata, remotes])

  // A tab nothing has restricted sends nothing until a split opens.
  const restricted = useRef(restrictedBeforeConnect)

  useEffect(() => {
    // Not connected: the list already sent stands, and the SDK sends it again
    // on reconnecting.
    if (listenersKey === undefined) return
    const listeners: string[] | null = JSON.parse(listenersKey)
    // Nothing was restricted, so there is nothing to lift.
    if (listeners === null && !restricted.current) return
    restricted.current = listeners !== null

    const { localParticipant } = room
    if (listeners === null) {
      localParticipant.setTrackSubscriptionPermissions(true, [])
      return
    }
    localParticipant.setTrackSubscriptionPermissions(
      false,
      listeners.map((identity) => ({
        participantIdentity: identity,
        allowAll: true,
      }))
    )
  }, [room, listenersKey])

  // A phone caller or an older tab never restricts itself: stop playing it.
  useEffect(() => {
    const subscribeIfSameRoom = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      const wanted = inSameBreakoutRoom(
        readSplit(room.metadata),
        room.localParticipant.identity,
        participant.identity
      )
      if (publication.isDesired !== wanted) publication.setSubscribed(wanted)
    }
    room.remoteParticipants.forEach((participant) =>
      participant.trackPublications.forEach((publication) =>
        subscribeIfSameRoom(publication, participant)
      )
    )
    room.on(RoomEvent.TrackPublished, subscribeIfSameRoom)
    return () => {
      room.off(RoomEvent.TrackPublished, subscribeIfSameRoom)
    }
  }, [room, state, metadata])
}

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
import { allowedListeners, inSameGroup, readSignal } from '../utils/group'

// Keeps this browser's audio and video inside its group. The media server
// refuses anyone a publisher does not list, whatever their browser does.
// isolatedOnJoin: Conference listed nobody before connecting.
export const useBreakoutIsolation = (isolatedOnJoin: boolean) => {
  const room = useRoomContext()
  const state = useConnectionState()
  const { metadata } = useRoomInfo()
  // The lists rest on who is here and their kind, never on what they do.
  const remotes = useRemoteParticipants({ updateOnlyOn: [] })

  // Read from the room itself: the hooks above only say when to look again.
  const key = useMemo(() => {
    if (state !== ConnectionState.Connected) return undefined
    const listeners = allowedListeners(
      readSignal(room.metadata),
      room.localParticipant.identity,
      remotes
    )
    return listeners && [...listeners].sort().join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, state, metadata, remotes])

  // A tab nothing has restricted sends nothing until a split opens.
  const restricted = useRef(isolatedOnJoin)
  // The flag known late gives a new room, which Conference restricted.
  useEffect(() => {
    restricted.current = isolatedOnJoin
  }, [room, isolatedOnJoin])
  // While reconnecting the stored list stands; the SDK sends it again.
  useEffect(() => {
    if (key === undefined || (key === null && !restricted.current)) return
    restricted.current = key !== null
    room.localParticipant.setTrackSubscriptionPermissions(
      key === null,
      key
        ? key.split('\n').map((identity) => ({
            participantIdentity: identity,
            allowAll: true,
          }))
        : []
    )
  }, [room, key])

  // A phone caller or an older tab never restricts itself: stop playing it.
  useEffect(() => {
    const follow = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      const wanted = inSameGroup(
        readSignal(room.metadata),
        room.localParticipant.identity,
        participant.identity
      )
      if (publication.isDesired !== wanted) publication.setSubscribed(wanted)
    }
    room.remoteParticipants.forEach((participant) =>
      participant.trackPublications.forEach((publication) =>
        follow(publication, participant)
      )
    )
    room.on(RoomEvent.TrackPublished, follow)
    return () => {
      room.off(RoomEvent.TrackPublished, follow)
    }
  }, [room, state, metadata])
}

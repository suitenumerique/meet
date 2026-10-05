import { useCallback, useMemo } from 'react'
import { useRoomContext, useRoomInfo } from '@livekit/components-react'
import {
  breakoutRoomOf,
  inSameBreakoutRoom,
  isInMainRoomOfSplit,
  readSplit,
} from '../utils/split'

// Which room this browser is in, and whether another identity shares it.
// Renders again only when the metadata or the connection changes.
export const useMyBreakoutRoom = () => {
  const room = useRoomContext()
  const { metadata } = useRoomInfo()
  const split = useMemo(() => readSplit(metadata), [metadata])
  const me = room.localParticipant.identity
  const isInMyBreakoutRoom = useCallback(
    (identity: string) => inSameBreakoutRoom(split, me, identity),
    [split, me]
  )
  return {
    isInMyBreakoutRoom,
    isOpen: split !== null,
    isInMainRoom: isInMainRoomOfSplit(split, me),
    roomName: split?.rooms[breakoutRoomOf(split, me)] ?? null,
  }
}

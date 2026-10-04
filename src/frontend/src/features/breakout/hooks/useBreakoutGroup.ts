import { useCallback, useMemo } from 'react'
import { useRoomContext, useRoomInfo } from '@livekit/components-react'
import {
  groupOf,
  inSameGroup,
  isInMainRoomOfSplit,
  readSignal,
} from '../utils/group'

// Which room this browser is in, and whether another identity shares it.
// Renders again only when the metadata or the connection changes.
export const useBreakoutGroup = () => {
  const room = useRoomContext()
  const { metadata } = useRoomInfo()
  const signal = useMemo(() => readSignal(metadata), [metadata])
  const me = room.localParticipant.identity
  const isInMyGroup = useCallback(
    (identity: string) => inSameGroup(signal, me, identity),
    [signal, me]
  )
  return {
    isInMyGroup,
    isOpen: signal !== null,
    isInMainRoom: isInMainRoomOfSplit(signal, me),
    roomName: signal?.rooms[groupOf(signal, me)] ?? null,
  }
}

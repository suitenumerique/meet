// features/rooms/hooks/useSyncLiveKitMetadata.ts

import { useEffect } from 'react'
import { RoomEvent } from 'livekit-client'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import {
  ApiAccessLevel,
  type ApiRoom,
  type RoomConfiguration,
} from '@/features/rooms/api/ApiRoom'
import { useAllowPublicRooms } from '@/features/rooms/hooks/useAllowPublicRooms'
import { useRoomContext } from '@livekit/components-react'
import { useRoomData } from './useRoomData'

/**
 * The subset of LiveKit's room metadata this hook actually uses.
 */
type RoomLiveKitMetadata = {
  configuration?: RoomConfiguration
  access_level?: ApiAccessLevel
}

const parseMetadata = (raw: string | undefined): RoomLiveKitMetadata | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as RoomLiveKitMetadata
  } catch {
    console.warn('useSyncLiveKitMetadata: failed to parse room metadata')
    return null
  }
}

/**
 * The level a meeting runs at, which the metadata can predate: a room live
 * across a deploy carries whatever it was last told, while that deploy may
 * have stopped allowing the level and moved the row to trusted.
 */
const enforcedAccessLevel = (
  level: ApiAccessLevel,
  allowPublic: boolean
): ApiAccessLevel =>
  !allowPublic && level === ApiAccessLevel.PUBLIC
    ? ApiAccessLevel.TRUSTED
    : level

/**
 * Sync LiveKit room metadata into the React Query cache.
 *
 * The backend pushes room configuration into LiveKit's room metadata
 * whenever it changes. This hook listens for those changes and patches
 * the ApiRoom cache so every `useRoomData()`
 * consumer sees the fresh value automatically.
 *
 * Mount once, at the level where the LiveKit Room instance lives.
 */
export const useSyncLiveKitMetadata = () => {
  const room = useRoomContext()
  const roomData = useRoomData()
  const roomSlug = roomData?.slug
  const allowPublic = useAllowPublicRooms()

  useEffect(() => {
    if (!room || !roomSlug) return

    const applyMetadata = (raw: string | undefined) => {
      const parsed = parseMetadata(raw)
      if (!parsed) return

      queryClient.setQueryData<ApiRoom>([keys.room, roomSlug], (prev) => {
        if (!prev) return prev
        const nextConfiguration = parsed.configuration ?? prev.configuration
        const nextAccessLevel = enforcedAccessLevel(
          parsed.access_level ?? prev.access_level,
          allowPublic
        )
        if (
          nextConfiguration === prev.configuration &&
          nextAccessLevel === prev.access_level
        ) {
          return prev
        }

        return {
          ...prev,
          configuration: nextConfiguration,
          access_level: nextAccessLevel,
        }
      })
    }

    // Apply whatever metadata is currently set (covers the case where we
    // joined the room AFTER the last metadata change, so no event will fire).
    applyMetadata(room.metadata)

    room.on(RoomEvent.RoomMetadataChanged, applyMetadata)

    return () => {
      room.off(RoomEvent.RoomMetadataChanged, applyMetadata)
    }
  }, [room, roomSlug, allowPublic])
}

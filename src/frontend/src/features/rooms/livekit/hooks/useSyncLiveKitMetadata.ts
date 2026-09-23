// features/rooms/hooks/useSyncLiveKitMetadata.ts

import { useEffect } from 'react'
import { RoomEvent } from 'livekit-client'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import {
  type ApiAccessLevel,
  type ApiRoom,
  type RoomConfiguration,
} from '@/features/rooms/api/ApiRoom'
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
 * Sync LiveKit room metadata into the React Query cache.
 *
 * The backend pushes room configuration into LiveKit's room metadata
 * whenever it changes. This hook patches the room's configuration from it,
 * and refetches the room when the metadata's level differs from the server's
 * answer, which is the level's only source.
 *
 * Mount once, at the level where the LiveKit Room instance lives.
 */
export const useSyncLiveKitMetadata = () => {
  const room = useRoomContext()
  const roomData = useRoomData()
  const roomSlug = roomData?.slug

  useEffect(() => {
    if (!room || !roomSlug) return

    const applyMetadata = (raw: string | undefined) => {
      const parsed = parseMetadata(raw)
      if (!parsed) return

      const cached = queryClient.getQueryData<ApiRoom>([keys.room, roomSlug])
      // The metadata is a snapshot of an earlier write. A level that differs
      // from the server's answer is a signal to refetch it, never a value to
      // write over the cache.
      if (
        cached &&
        parsed.access_level &&
        parsed.access_level !== cached.access_level
      ) {
        queryClient.invalidateQueries({ queryKey: [keys.room, roomSlug] })
      }

      queryClient.setQueryData<ApiRoom>([keys.room, roomSlug], (prev) => {
        if (!prev) return prev
        const nextConfiguration = parsed.configuration ?? prev.configuration
        if (nextConfiguration === prev.configuration) {
          return prev
        }

        return { ...prev, configuration: nextConfiguration }
      })
    }

    // Apply whatever metadata is currently set (covers the case where we
    // joined the room AFTER the last metadata change, so no event will fire).
    applyMetadata(room.metadata)

    room.on(RoomEvent.RoomMetadataChanged, applyMetadata)

    return () => {
      room.off(RoomEvent.RoomMetadataChanged, applyMetadata)
    }
  }, [room, roomSlug])
}

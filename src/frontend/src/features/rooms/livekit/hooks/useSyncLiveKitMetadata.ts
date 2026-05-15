// features/rooms/hooks/useSyncLiveKitMetadata.ts

import { useEffect } from 'react'
import { RoomEvent } from 'livekit-client'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import type { ApiRoom, RoomConfiguration } from '@/features/rooms/api/ApiRoom'
import { useRoomContext } from '@livekit/components-react'
import { useRoomData } from './useRoomData'

/**
 * Shape of the LiveKit room metadata blob pushed by the backend.
 * Matches RoomManagement.update_metadata → {"configuration": room.configuration}
 */
type RoomLiveKitMetadata = {
  configuration?: RoomConfiguration
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

  useEffect(() => {
    if (!room || !roomSlug) return

    const applyMetadata = (raw: string | undefined) => {
      const parsed = parseMetadata(raw)
      // No configuration key → leave the cache alone. Don't clobber the
      // value we already loaded from the API with `undefined`.
      if (!parsed?.configuration) return

      queryClient.setQueryData<ApiRoom>([keys.room, roomSlug], (prev) => {
        if (!prev) return prev
        if (
          JSON.stringify(prev.configuration) ===
          JSON.stringify(parsed.configuration)
        ) {
          return prev
        }
        return { ...prev, configuration: parsed.configuration }
      })
    }

    // Apply whatever metadata is currently set (covers the case where we
    // joined the room AFTER the last metadata change, so no event will fire).
    applyMetadata(room.metadata)

    const handler = (raw: string) => applyMetadata(raw)
    room.on(RoomEvent.RoomMetadataChanged, handler)

    return () => {
      room.off(RoomEvent.RoomMetadataChanged, handler)
    }
  }, [room, roomSlug])
}

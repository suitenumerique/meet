import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useCallback } from 'react'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'

export const usePermissionsManager = () => {
  const { mutateAsync: patchRoom } = usePatchRoom()

  const data = useRoomData()
  const configuration = data?.configuration
  const roomId = data?.slug

  const isMutingEnabled = configuration?.everyone_can_mute ?? true

  const toggleMuting = useCallback(
    async (enabled: boolean) => {
      if (!roomId) return

      try {
        const newConfiguration = {
          ...configuration,
          everyone_can_mute: enabled,
        }

        const room = await patchRoom({
          roomId,
          room: { configuration: newConfiguration },
        })

        queryClient.setQueryData([keys.room, roomId], room)

        return { configuration: newConfiguration }
      } catch (error) {
        console.error('Failed to update muting permission:', error)
        return { success: false, error }
      }
    },
    [configuration, roomId, patchRoom]
  )

  return {
    toggleMuting,
    isMutingEnabled,
  }
}

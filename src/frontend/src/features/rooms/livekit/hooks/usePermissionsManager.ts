import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useCallback } from 'react'

export const usePermissionsManager = () => {
  const { mutateAsync: patchRoom } = usePatchRoom()

  const data = useRoomData()
  const configuration = data?.configuration
  const roomId = data?.slug

  const isMutingEnabled = configuration?.everyone_can_mute ?? true
  const isAuthenticatedCanRecordEnabled =
    configuration?.authenticated_can_record ?? true

  const toggleMuting = useCallback(
    async (enabled: boolean) => {
      if (!roomId) return

      try {
        const newConfiguration = {
          ...configuration,
          everyone_can_mute: enabled,
        }

        await patchRoom({
          roomId,
          room: { configuration: newConfiguration },
        })

        return { configuration: newConfiguration }
      } catch (error) {
        console.error('Failed to update muting permission:', error)
        return { success: false, error }
      }
    },
    [configuration, roomId, patchRoom]
  )

  const toggleAuthenticatedCanRecord = useCallback(
    async (enabled: boolean) => {
      if (!roomId) return

      try {
        const newConfiguration = {
          ...configuration,
          authenticated_can_record: enabled,
        }

        const room = await patchRoom({
          roomId,
          room: { configuration: newConfiguration },
        })

        queryClient.setQueryData([keys.room, roomId], room)

        return { configuration: newConfiguration }
      } catch (error) {
        console.error('Failed to update recording permission:', error)
        return { success: false, error }
      }
    },
    [configuration, roomId, patchRoom]
  )

  return {
    toggleMuting,
    isMutingEnabled,
    isAuthenticatedCanRecordEnabled,
    toggleAuthenticatedCanRecord,
  }
}

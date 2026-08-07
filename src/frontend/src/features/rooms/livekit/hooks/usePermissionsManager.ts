import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useCallback } from 'react'
import { reportError } from '@/features/analytics/telemetry'

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

        await patchRoom({
          roomId,
          room: { configuration: newConfiguration },
        })

        return { configuration: newConfiguration }
      } catch (error) {
        reportError('permissions_api_failure', error, {
          context: 'Failed to update muting permission:',
        })
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

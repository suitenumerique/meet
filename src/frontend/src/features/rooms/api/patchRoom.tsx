import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'
import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import type { ApiError } from '@/api/ApiError'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { fetchRoom } from './fetchRoom'

type RoomSettings = Pick<ApiRoom, 'configuration' | 'access_level'>

export type PatchRoomParams = {
  roomId: string
  room: Partial<RoomSettings>
}

export const patchRoom = ({ roomId, room }: PatchRoomParams) => {
  return fetchApi<ApiRoom>(`/rooms/${roomId}/`, {
    method: 'PATCH',
    body: JSON.stringify(room),
  })
}

export const patchRoomMutationKey = ['patchRoom']

let latestResync = 0

export const resyncRoomSettings = async (roomId: string) => {
  const resync = ++latestResync
  const { configuration, access_level } = await fetchRoom({ roomId })
  if (resync !== latestResync) return
  if (queryClient.isMutating({ mutationKey: patchRoomMutationKey })) return
  queryClient.setQueryData<ApiRoom>(
    [keys.room, roomId],
    (previous) => previous && { ...previous, configuration, access_level }
  )
}

export function usePatchRoom(
  options?: UseMutationOptions<ApiRoom, ApiError, PatchRoomParams>
) {
  return useMutation<ApiRoom, ApiError, PatchRoomParams>({
    mutationKey: patchRoomMutationKey,
    mutationFn: patchRoom,
    onMutate: async ({ roomId, room: partialRoom }) => {
      await queryClient.cancelQueries({ queryKey: [keys.room, roomId] })
      queryClient.setQueryData<ApiRoom>([keys.room, roomId], (previous) =>
        previous ? { ...previous, ...partialRoom } : previous
      )
    },
    onSettled: (_data, _error, { roomId }) => {
      if (queryClient.isMutating({ mutationKey: patchRoomMutationKey }) === 1) {
        resyncRoomSettings(roomId).catch(() => undefined)
      }
    },
    ...options,
  })
}

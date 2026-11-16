import { useCallback, useSyncExternalStore } from 'react'
import { hashKey, notifyManager } from '@tanstack/react-query'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useParams } from 'wouter'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'

export const useRoomData = (): ApiRoom | undefined => {
  const { roomId } = useParams()

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const queryHash = hashKey([keys.room, roomId])
      const notify = notifyManager.batchCalls(onStoreChange)
      return queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === queryHash) notify()
      })
    },
    [roomId]
  )

  const getSnapshot = useCallback(
    () => queryClient.getQueryData<ApiRoom>([keys.room, roomId]),
    [roomId]
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}

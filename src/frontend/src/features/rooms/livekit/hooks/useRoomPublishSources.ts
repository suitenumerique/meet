import { Track } from 'livekit-client'
import { useMemo } from 'react'
import { useConfig } from '@/api/useConfig'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isSubsetOf } from '@/features/rooms/utils/isSubsetOf'
import Source = Track.Source

const EMPTY_SOURCES: Source[] = []

export const useDefaultPublishSources = (): Source[] => {
  const { data: configData } = useConfig()
  return configData?.livekit?.default_sources ?? EMPTY_SOURCES
}

export const useRoomPublishSources = (): Source[] => {
  const data = useRoomData()
  const defaultSources = useDefaultPublishSources()
  const roomSources = data?.configuration?.can_publish_sources

  return useMemo(
    () => (Array.isArray(roomSources) ? roomSources : defaultSources),
    [defaultSources, roomSources]
  )
}

export const useHasLockedSource = (): boolean => {
  const defaultSources = useDefaultPublishSources()
  const roomSources = useRoomPublishSources()
  return !isSubsetOf(defaultSources, roomSources)
}

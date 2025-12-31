import { useRoomInfo } from '@livekit/components-react'
import { useMemo } from 'react'

export const useRoomMetadata = () => {
  const { metadata } = useRoomInfo()
  return useMemo(() => {
    if (metadata) {
      try {
        return JSON.parse(metadata)
      } catch (error) {
        console.error('Failed to parse room metadata:', error)
        return undefined
      }
    } else {
      return undefined
    }
  }, [metadata])
}

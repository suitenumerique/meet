import { useRoomInfo } from '@livekit/components-react'
import { useMemo } from 'react'
import { reportError } from '@/features/analytics/telemetry'

export const useRoomMetadata = () => {
  const { metadata } = useRoomInfo()
  return useMemo(() => {
    if (metadata) {
      try {
        return JSON.parse(metadata)
      } catch (error) {
        reportError('generic_failure', error, {
          context: 'Failed to parse room metadata:',
        })
        return undefined
      }
    } else {
      return undefined
    }
  }, [metadata])
}

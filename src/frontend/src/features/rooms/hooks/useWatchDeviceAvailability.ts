import { useEffect } from 'react'
import { syncDeviceAvailability } from '@/stores/deviceAvailability'

export function useWatchDeviceAvailability() {
  useEffect(() => {
    if (!navigator.mediaDevices) return
    syncDeviceAvailability()
    navigator.mediaDevices.addEventListener(
      'devicechange',
      syncDeviceAvailability
    )
    return () => {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        syncDeviceAvailability
      )
    }
  }, [])
}

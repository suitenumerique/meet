import { useEffect } from 'react'
import { syncPermissions } from '@/stores/permissions'

export const useWatchPermissions = () => {
  useEffect(() => {
    const sync = () => void syncPermissions()
    sync()

    navigator.mediaDevices?.addEventListener?.('devicechange', sync)
    window.addEventListener('focus', sync)

    let statuses: PermissionStatus[] = []
    let cancelled = false
    if (navigator.permissions) {
      Promise.all([
        navigator.permissions.query({ name: 'camera' as PermissionName }),
        navigator.permissions.query({ name: 'microphone' as PermissionName }),
      ])
        .then((results) => {
          if (cancelled) return
          statuses = results
          statuses.forEach((s) => s.addEventListener('change', sync))
        })
        .catch(() => {
          // Query unsupported: devicechange/focus + gUM outcomes cover it.
        })
    }

    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', sync)
      window.removeEventListener('focus', sync)
      statuses.forEach((s) => s.removeEventListener('change', sync))
    }
  }, [])
}

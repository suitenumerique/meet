import { useWatchPermissions } from '@/features/rooms/hooks/useWatchPermissions'

/**
 * Singleton component - ensures permissions sync runs only once across the app.
 * WARNING: This component should only be instantiated once in the interface.
 * Multiple instances may cause unexpected behavior or performance issues.
 */
export const Permissions = () => {
  useWatchPermissions()
  return null
}

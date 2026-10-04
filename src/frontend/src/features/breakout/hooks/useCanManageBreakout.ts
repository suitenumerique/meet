import { useConfig } from '@/api/useConfig'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useBreakoutGroup } from './useBreakoutGroup'

// False while the config loads.
export const useBreakoutEnabled = () =>
  useConfig().data?.breakout_rooms?.is_enabled === true

// Opening needs the flag; a split already open can always be closed.
export const useCanManageBreakout = () => {
  const isAdminOrOwner = useIsAdminOrOwner()
  const isEnabled = useBreakoutEnabled()
  const { isOpen } = useBreakoutGroup()
  return {
    canOpen: isAdminOrOwner && isEnabled,
    canManage: isAdminOrOwner && (isEnabled || isOpen),
  }
}

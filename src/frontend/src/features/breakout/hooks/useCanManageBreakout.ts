import { useConfig } from '@/api/useConfig'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useMyBreakoutRoom } from './useMyBreakoutRoom'

// False while the config loads.
export const useBreakoutEnabled = () =>
  useConfig().data?.breakout_rooms?.is_enabled === true

// Opening needs the flag; a split already open can always be closed.
export const useCanManageBreakout = () => {
  const isAdminOrOwner = useIsAdminOrOwner()
  const isEnabled = useBreakoutEnabled()
  const { isSplit } = useMyBreakoutRoom()
  return {
    canOpen: isAdminOrOwner && isEnabled,
    canManage: isAdminOrOwner && (isEnabled || isSplit),
    // Close follows the role alone: a split outlives the flag and its key.
    canClose: isAdminOrOwner,
  }
}

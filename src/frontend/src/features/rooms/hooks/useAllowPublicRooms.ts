import { useConfig } from '@/api/useConfig'

/**
 * Whether this instance still lets a room be open to anyone holding the link,
 * and undefined while the configuration is unread, which a caller answers its
 * own way. The key is absent on an instance that has never set it, which
 * allows it.
 */
export const useAllowPublicRooms = (): boolean | undefined => {
  const { data: config, isSuccess } = useConfig()
  if (!isSuccess) return undefined
  return config?.resource?.allow_public_rooms !== false
}

import { useConfig } from '@/api/useConfig'

/**
 * Whether this instance still lets a room be open to anyone holding the link.
 * The key is absent on an instance that has never set it, which allows it.
 */
export const useAllowPublicRooms = () => {
  const { data: config } = useConfig()
  return config?.resource?.allow_public_rooms !== false
}

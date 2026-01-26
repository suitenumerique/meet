import { useRoomData } from './useRoomData'

/**
 * Hook to check if the current user is an owner of the room.
 * Uses the is_owner field from the room API response.
 * @returns true if the current user is an owner, false otherwise
 */
export const useIsOwner = (): boolean => {
  const apiRoomData = useRoomData()
  return apiRoomData?.is_owner ?? false
}

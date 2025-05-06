export const roomIdPattern = '[a-z]{3}-[a-z]{4}-[a-z]{3}'

// Case-insensitive and with optional hyphens
export const flexibleRoomIdPattern =
  '(?:[a-zA-Z0-9]{3}-?[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{3})'

export const isRoomValid = (roomIdOrUrl: string) =>
  new RegExp(`^${roomIdPattern}$`).test(roomIdOrUrl) ||
  new RegExp(`^${window.location.origin}/${roomIdPattern}$`).test(roomIdOrUrl)

export const normalizeRoomId = (roomId: string) => {
  const cleanId = roomId.toLowerCase().replace(/-/g, '')
  if (cleanId.length === 10) {
    return `${cleanId.slice(0, 3)}-${cleanId.slice(3, 7)}-${cleanId.slice(7, 10)}`
  }
  return roomId
}

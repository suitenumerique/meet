export const roomIdPattern = '[a-z]{3}-[a-z]{4}-[a-z]{3}'

// Case-insensitive and with optional hyphens
export const flexibleRoomIdPattern =
  '(?:[a-zA-Z0-9]{3}-?[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{3})'

const roomRegex = new RegExp(`^${roomIdPattern}$`)

export const isRoomValid = (roomIdOrUrl: string) =>
  roomRegex.test(roomIdOrUrl) ||
  new RegExp(`^${window.location.origin}/${roomIdPattern}$`).test(roomIdOrUrl)

export const extractRoomId = (
  input: string,
  origin: string = window.location.origin
): { roomId: string; suffix: string } | null => {
  const value = input.trim()
  if (roomRegex.test(value)) return { roomId: value, suffix: '' }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin !== origin) return null

  const path = url.pathname.slice(1)
  const roomId = path.endsWith('/') ? path.slice(0, -1) : path
  return roomRegex.test(roomId)
    ? { roomId, suffix: `${url.search}${url.hash}` }
    : null
}

export const normalizeRoomId = (roomId: string) => {
  const cleanId = roomId.toLowerCase().replace(/-/g, '')
  if (cleanId.length === 10) {
    return `${cleanId.slice(0, 3)}-${cleanId.slice(3, 7)}-${cleanId.slice(7, 10)}`
  }
  return roomId
}

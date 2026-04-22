// Google Meet uses only letters in a room identifier
const ROOM_ID_ALLOWED_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz'

const getRandomChar = () => {
  const maxValue = Math.floor(0x100000000 / ROOM_ID_ALLOWED_CHARACTERS.length) * ROOM_ID_ALLOWED_CHARACTERS.length
  const randomValue = new Uint32Array(1)

  do {
    crypto.getRandomValues(randomValue)
  } while (randomValue[0] >= maxValue)

  return ROOM_ID_ALLOWED_CHARACTERS[randomValue[0] % ROOM_ID_ALLOWED_CHARACTERS.length]
}

const generateSegment = (length: number): string =>
  Array.from(Array(length), getRandomChar).join('')

// Generates a unique room identifier following the Google Meet format
export const generateRoomId = () =>
  [generateSegment(3), generateSegment(4), generateSegment(3)].join('-')

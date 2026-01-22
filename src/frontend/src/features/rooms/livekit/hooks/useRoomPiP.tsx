import { useContext } from 'react'
import { RoomPiPContext } from './roomPiPContext'

export const useRoomPiP = () => {
  const context = useContext(RoomPiPContext)
  if (!context) {
    throw new Error('useRoomPiP must be used within a RoomPiPProvider')
  }
  return context
}

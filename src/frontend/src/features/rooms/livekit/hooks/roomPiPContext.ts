import { createContext } from 'react'

export type RoomPiPContextValue = {
  isSupported: boolean
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const RoomPiPContext = createContext<RoomPiPContextValue | null>(null)


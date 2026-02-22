import { useCallback } from 'react'
import { useSnapshot } from 'valtio'
import { roomPiPStore } from '@/stores/roomPiP'

export const useRoomPiP = () => {
  const { isOpen } = useSnapshot(roomPiPStore)
  const isSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window

  const open = useCallback(() => {
    roomPiPStore.isOpen = true
  }, [])

  const close = useCallback(() => {
    roomPiPStore.isOpen = false
  }, [])

  const toggle = useCallback(() => {
    roomPiPStore.isOpen = !roomPiPStore.isOpen
  }, [])

  return {
    isSupported,
    isOpen,
    open,
    close,
    toggle,
  }
}

import { useEffect, type ReactNode } from 'react'

import { roomPiPStore } from '@/stores/roomPiP'
import { DocumentPiPPortal } from './DocumentPiPPortal'
import { PipView } from './PipView'
import { useRoomPiP } from '../hooks/useRoomPiP'

/**
 * Wrapper that mounts the PiP UI when room-level PiP state is enabled.
 * Bridges Valtio-backed PiP state with DocumentPiPPortal and PipView rendering.
 * PiP panel state is decoupled via explicit pipLayoutStore injection.
 */
export const RoomPiP = (): ReactNode => {
  const { isOpen, close } = useRoomPiP()

  // Reset PiP state on unmount (e.g. leaving the room) so the next session
  // starts with PiP closed and doesn't try to auto-reopen without a user gesture.
  useEffect(() => {
    return () => {
      roomPiPStore.isOpen = false
    }
  }, [])

  const portal = DocumentPiPPortal({
    isOpen,
    onClose: close,
    children: <PipView />,
  })
  return portal as ReactNode
}

import type { ReactNode } from 'react'

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

  const portal = DocumentPiPPortal({
    isOpen,
    onClose: close,
    children: <PipView />,
  })
  return portal as ReactNode
}

import { DocumentPiPPortal } from './DocumentPiPPortal'
import { PipView } from './PipView'
import { useRoomPiP } from '../hooks/useRoomPiP'

/**
 * Wrapper that mounts the PiP UI when room-level PiP state is enabled.
 * Bridges Valtio-backed PiP state with DocumentPiPPortal and PipView rendering.
 */
export const RoomPiP = () => {
  const { isOpen, close } = useRoomPiP()

  return (
    <DocumentPiPPortal isOpen={isOpen} onClose={close}>
      <PipView />
    </DocumentPiPPortal>
  )
}

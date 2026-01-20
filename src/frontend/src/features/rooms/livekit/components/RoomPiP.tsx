import { DocumentPiPPortal } from './DocumentPiPPortal'
import { PipView } from './PipView'
import { useRoomPiP } from '../hooks/useRoomPiP'

export const RoomPiP = () => {
  const { isOpen, close } = useRoomPiP()

  return (
    <DocumentPiPPortal isOpen={isOpen} onClose={close}>
      <PipView />
    </DocumentPiPPortal>
  )
}


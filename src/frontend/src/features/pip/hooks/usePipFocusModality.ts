import { useEffect, type RefObject } from 'react'
import { setInteractionModality } from '@react-aria/interactions'

/**
 * Sync React Aria's interaction modality with the PiP document.
 * React Aria only installs keyboard/mouse listeners on the main document,
 * so focus-visible rings never appear in PiP without this bridge.
 */
export const usePipFocusModality = (
  containerRef: RefObject<HTMLElement | null>
) => {
  useEffect(() => {
    const doc = containerRef.current?.ownerDocument
    if (!doc || doc === document) return

    const onKeyDown = () => setInteractionModality('keyboard')
    const onMouseDown = () => setInteractionModality('pointer')

    doc.addEventListener('keydown', onKeyDown, true)
    doc.addEventListener('mousedown', onMouseDown, true)
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true)
      doc.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [containerRef])
}

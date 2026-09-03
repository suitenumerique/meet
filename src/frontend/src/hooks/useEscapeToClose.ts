import { useEffect, useRef, type RefObject } from 'react'

export const useEscapeToClose = (
  isActive: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
) => {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!containerRef.current?.contains(document.activeElement)) return
      e.stopPropagation()
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isActive, containerRef])
}

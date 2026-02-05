import { useEffect, useRef } from 'react'

type UseEscapeKeyOptions = {
  isActive: boolean
  capture?: boolean
  preventDefault?: boolean
  stopPropagation?: boolean
}

export const useEscapeKey = (
  handler: () => void,
  {
    isActive,
    capture = false,
    preventDefault = false,
    stopPropagation = false,
  }: UseEscapeKeyOptions
) => {
  const handleRef = useRef(handler)
  handleRef.current = handler
  useEffect(() => {
    if (!isActive) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (preventDefault) event.preventDefault()
      if (stopPropagation) event.stopPropagation()
      handleRef.current()
    }

    document.addEventListener('keydown', onKeyDown, capture)
    return () => {
      document.removeEventListener('keydown', onKeyDown, capture)
    }
  }, [capture, isActive, preventDefault, stopPropagation])
}

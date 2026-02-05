import { useEffect } from 'react'

type UseFocusOnOpenOptions = {
  selector: string
  delayMs?: number
  preventScroll?: boolean
}

export const useFocusOnOpen = (
  isOpen: boolean,
  containerRef: React.RefObject<HTMLElement>,
  { selector, delayMs = 0, preventScroll = true }: UseFocusOnOpenOptions
) => {
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      requestAnimationFrame(() => {
        const first = containerRef.current?.querySelector<HTMLElement>(selector)
        first?.focus({ preventScroll })
      })
    }, delayMs)
    return () => clearTimeout(timer)
  }, [containerRef, delayMs, isOpen, preventScroll, selector])
}

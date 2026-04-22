import { useCallback, useEffect, useState, type RefObject } from 'react'

type Size = { width: number; height: number }

/**
 * Observes an element's size, even when mounted in the PiP document.
 * Resolves `ResizeObserver` from the element's own window.
 */
export const usePipElementSize = <T extends HTMLElement>(
  ref: RefObject<T | null>
): Size => {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    measure()

    const RO =
      el.ownerDocument.defaultView?.ResizeObserver ?? window.ResizeObserver
    if (!RO) return

    const observer = new RO((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, measure])

  return size
}

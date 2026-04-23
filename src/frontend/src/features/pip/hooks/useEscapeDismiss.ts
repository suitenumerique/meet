import { useEffect, useRef, type RefObject } from 'react'

export const useEscapeDismiss = (
  ref: RefObject<HTMLElement | null>,
  isActive: boolean,
  onDismiss: () => void
) => {
  const latestOnDismiss = useRef(onDismiss)
  useEffect(() => {
    latestOnDismiss.current = onDismiss
  })

  useEffect(() => {
    if (!isActive) return
    const el = ref.current
    if (!el) return

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      latestOnDismiss.current()
    }

    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [ref, isActive])
}

import { useEffect, useRef } from 'react'

export type useLongPressProps = {
  keyCode?: string
  onKeyDown: () => void
  onKeyUp: () => void
  longPressThreshold?: number
  isDisabled?: boolean
}

export const useLongPress = ({
  keyCode,
  onKeyDown,
  onKeyUp,
  longPressThreshold = 300,
  isDisabled = false,
}: useLongPressProps) => {
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isDisabled) {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
        timeoutIdRef.current = null
      }
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code != keyCode || timeoutIdRef.current) return
      timeoutIdRef.current = setTimeout(() => {
        onKeyDown()
      }, longPressThreshold)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code != keyCode || !timeoutIdRef.current) return
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
      onKeyUp()
    }

    if (!keyCode) return

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
        timeoutIdRef.current = null
      }
    }
  }, [keyCode, onKeyDown, onKeyUp, longPressThreshold, isDisabled])

  return
}

export default useLongPress

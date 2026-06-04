import { useEffect, useRef, useState } from 'react'

/**
 * If value stays truthy for more than waitFor ms, syncValue takes the value of value.
 * @param value
 * @param waitFor
 * @returns
 */
export function useSyncAfterDelay<T>(value: T, waitFor: number = 300) {
  const valueRef = useRef(value)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const [syncValue, setSyncValue] = useState<T>()

  useEffect(() => {
    valueRef.current = value
    if (value) {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          setSyncValue(valueRef.current)
          timeoutRef.current = undefined
        }, waitFor)
      }
    } else {
      setSyncValue(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return syncValue
}

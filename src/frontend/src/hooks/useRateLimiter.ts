import { useCallback, useRef } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RateLimiterProps<T extends (...args: any[]) => any> = {
  callback: T
  maxCalls: number
  windowMs: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function useRateLimiter<T extends (...args: any[]) => any>({
  callback,
  maxCalls = 5,
  windowMs = 1000,
}: RateLimiterProps<T>) {
  const callsCountRef = useRef(0)
  const resetTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const rateLimitedFn = useCallback(
    (...args: Parameters<T>) => {
      if (callsCountRef.current < maxCalls) {
        callsCountRef.current += 1
        if (callsCountRef.current === 1) {
          resetTimeoutRef.current = setTimeout(() => {
            callsCountRef.current = 0
            resetTimeoutRef.current = undefined
          }, windowMs)
        }
        return callback(...args)
      } else {
        return null
      }
    },
    [callback, maxCalls, windowMs]
  )
  return rateLimitedFn
}

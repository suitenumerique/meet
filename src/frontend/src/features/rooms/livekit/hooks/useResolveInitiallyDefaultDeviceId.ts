import { useEffect, useRef } from 'react'

export const useResolveInitiallyDefaultDeviceId = <
  T extends { getDeviceId(): Promise<string | undefined> },
>(
  currentId: string,
  track: T | undefined,
  save: (id: string) => void
) => {
  const isInitiated = useRef(false)
  useEffect(() => {
    if (currentId !== 'default' || !track || isInitiated.current) return
    const resolveDefaultDeviceId = async () => {
      const actualDeviceId = await track.getDeviceId()
      if (actualDeviceId && actualDeviceId !== 'default') {
        isInitiated.current = true
        save(actualDeviceId)
      }
    }
    resolveDefaultDeviceId()
  }, [currentId, track, save])
}

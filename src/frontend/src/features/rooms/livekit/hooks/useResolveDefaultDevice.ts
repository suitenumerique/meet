import { useEffect } from 'react'

export const useResolveDefaultDeviceId = <
  T extends { getDeviceId(): Promise<string | undefined> },
>(
  currentId: string,
  track: T | undefined,
  save: (id: string) => void
) => {
  useEffect(() => {
    if (currentId !== 'default' || !track) return
    const resolveDefaultDeviceId = async () => {
      const actualDeviceId = await track.getDeviceId()
      if (actualDeviceId && actualDeviceId !== 'default') save(actualDeviceId)
    }
    resolveDefaultDeviceId()
  }, [currentId, track, save])
}

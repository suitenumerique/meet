import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'
import { useStartSubtitle } from '../api/startSubtitle'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

export const useSubtitles = () => {
  const layoutSnap = useSnapshot(layoutStore)

  const apiRoomData = useRoomData()
  const { mutateAsync: startSubtitleRoom, isPending } = useStartSubtitle()

  const toggleSubtitles = async () => {
    if (!layoutSnap.showSubtitles && apiRoomData?.livekit) {
      await startSubtitleRoom({
        id: apiRoomData?.livekit?.room,
        token: apiRoomData?.livekit?.token,
      })
    }

    layoutStore.showSubtitles = !layoutSnap.showSubtitles
  }

  return {
    areSubtitlesOpen: layoutSnap.showSubtitles,
    toggleSubtitles,
    areSubtitlesPending: isPending,
  }
}

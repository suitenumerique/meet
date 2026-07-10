import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'
import { useStartSubtitle } from '../api/startSubtitle'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { useEffect } from 'react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { useCaptionTakeover } from '../captionBus'

// Module-level: the takeover-open edge is consumed once per takeover, not once
// per hook instance — a consumer mounting later must not override a manual close.
let openedForTakeover = false

export const useSubtitles = () => {
  const layoutSnap = useSnapshot(layoutStore)

  const room = useRoomContext()
  const apiRoomData = useRoomData()
  const { mutateAsync: startSubtitleRoom, isPending } = useStartSubtitle()

  // User action: POST start-subtitle (dispatches the native agent), then reveal.
  const toggleSubtitles = async () => {
    if (!layoutSnap.showSubtitles && apiRoomData?.livekit) {
      await startSubtitleRoom({
        id: apiRoomData?.livekit?.room,
        token: apiRoomData?.livekit?.token,
      })
    }

    layoutStore.showSubtitles = !layoutSnap.showSubtitles
  }

  const connected = useConnectionState(room) === ConnectionState.Connected

  // Claim-driven auto-open: reveal the overlay once when a plugin takes over the
  // bus. The edge is consumed only once connected (a takeover during connect still
  // opens on connect); reset on release; a manual close is respected.
  const overridden = useCaptionTakeover()
  useEffect(() => {
    if (!overridden) {
      openedForTakeover = false
      return
    }
    if (openedForTakeover || !connected) return
    openedForTakeover = true
    layoutStore.showSubtitles = true
  }, [overridden, connected])

  useEffect(() => {
    if (!room) return

    const closeSubtitles = () => {
      layoutStore.showSubtitles = false
    }
    room.on(RoomEvent.Disconnected, closeSubtitles)
    return () => {
      room.off(RoomEvent.Disconnected, closeSubtitles)
    }
  }, [room])

  return {
    areSubtitlesOpen: layoutSnap.showSubtitles,
    toggleSubtitles,
    areSubtitlesPending: isPending,
  }
}

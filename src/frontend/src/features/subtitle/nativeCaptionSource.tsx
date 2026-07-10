import { useEffect, useRef } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  type Participant,
  type TranscriptionSegment,
  RoomEvent,
} from 'livekit-client'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import {
  NATIVE_SOURCE_ID,
  claim,
  push,
  release,
  useCaptionTakeover,
} from './captionBus'
import { stopSubtitle } from './api/stopSubtitle'

/**
 * Headless native caption source (priority 0): subscribes to
 * `RoomEvent.TranscriptionReceived`, normalizes each segment, and pushes it while
 * top owner. While a plugin controller owns the bus it releases its claim and
 * unsubscribes; it re-claims when the takeover ends. It never (re)starts the
 * native agent itself — that stays a user action (CC button).
 */
export const NativeCaptionSource = (): null => {
  const room = useRoomContext()
  const apiRoomData = useRoomData()
  const overridden = useCaptionTakeover()
  const stoppedRef = useRef(false)

  // When overridden, stop the native subtitle producer (redundant while a plugin
  // owns captions). Best-effort, idempotent; needs the room's LiveKit token.
  // Re-armed when the takeover ends: the user may restart the native agent via
  // CC, and a later takeover must stop it again.
  useEffect(() => {
    if (!overridden) {
      stoppedRef.current = false
      return
    }
    if (stoppedRef.current) return
    const id = apiRoomData?.livekit?.room
    const token = apiRoomData?.livekit?.token
    if (!id || !token) return
    stoppedRef.current = true
    stopSubtitle({ id, token }).catch(() => {})
  }, [overridden, apiRoomData])

  useEffect(() => {
    if (!room || overridden) return
    const token = claim(NATIVE_SOURCE_ID, { priority: 0 })
    if (!token) return

    const onTranscription = (
      segments: TranscriptionSegment[],
      participant?: Participant
    ) => {
      if (!participant || segments.length === 0) return
      // LiveKit delivers one segment per event here; ignore the unexpected batch case.
      if (segments.length > 1) return
      const segment = segments[0]
      push(token, [
        {
          id: segment.id,
          text: segment.text,
          final: segment.final,
          firstReceivedTime: segment.firstReceivedTime,
          lastReceivedTime: segment.lastReceivedTime,
          language: segment.language,
          speaker: {
            key: participant.identity,
            name: getParticipantName(participant),
            color: getParticipantColor(participant),
          },
        },
      ])
    }

    room.on(RoomEvent.TranscriptionReceived, onTranscription)
    return () => {
      room.off(RoomEvent.TranscriptionReceived, onTranscription)
      release(token)
    }
  }, [room, overridden])

  return null
}

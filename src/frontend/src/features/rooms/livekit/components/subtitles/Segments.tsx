import { css } from "@/styled-system/css";
import { layoutStore } from "@/stores/layout.ts";
import { useSnapshot } from "valtio";
import {useMaybeRoomContext} from "@livekit/components-react";
import {useEffect, useState} from "react";
import {Participant, RoomEvent, TrackPublication, TranscriptionSegment} from "livekit-client";


export const Segments = () => {

  const room = useMaybeRoomContext()
  const [transcriptions, setTranscriptions] = useState<{
    [id: string]: TranscriptionSegment
  }>({})



  useEffect(() => {
    if (!room) {
      return
    }

    const updateTranscriptions = (
      segments: TranscriptionSegment[],
      participant?: Participant,
      publication?: TrackPublication
    ) => {
      setTranscriptions((prev) => {
        const newTranscriptions = { ...prev }
        for (const segment of segments) {
          newTranscriptions[segment.id] = segment
        }
        return newTranscriptions
      })
    }

    room.on(RoomEvent.TranscriptionReceived, updateTranscriptions)
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions)
    }
  }, [room])


  const layoutSnap = useSnapshot(layoutStore)
  if (!layoutSnap.showSubtitle) return

  return (
    <div className={css({
      backgroundColor: 'white',
      height: '150px',
      width: '100%',
      position: 'absolute',
      bottom: '0px'
    })}>
      <ul>
        {Object.values(transcriptions)
          .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
          .map((segment) => (
            <li key={segment.id}>{segment.text}</li>
          ))}
      </ul>
    </div>
  )
}
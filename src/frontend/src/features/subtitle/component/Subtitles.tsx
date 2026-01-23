import { useEffect, useMemo, useState } from 'react'
import { useSubtitles } from '../hooks/useSubtitles'
import { css, cva } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { Text } from '@/primitives'
import { useRoomContext } from '@livekit/components-react'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { Participant, RoomEvent } from 'livekit-client'

export interface TranscriptionSegment {
  id: string
  text: string
  language: string
  startTime?: number
  endTime: number
  final: boolean
  firstReceivedTime: number
  lastReceivedTime: number
}

export interface TranscriptionSegmentWithParticipant
  extends TranscriptionSegment {
  participant: Participant
}

export interface TranscriptionRow {
  id: string
  participant: Participant
  segments: TranscriptionSegment[]
  startTime?: number
  lastUpdateTime: number
  lastReceivedTime: number
}

const useTranscriptionState = () => {
  const [transcriptionSegments, setTranscriptionSegments] = useState<
    TranscriptionSegmentWithParticipant[]
  >([])

  const updateTranscriptionSegments = (
    segments: TranscriptionSegment[],
    participant?: Participant
  ) => {
    console.log(participant, segments)

    if (!participant || segments.length === 0) return

    if (segments.length > 1) {
      console.warn('Unexpected error more segments')
      return
    }

    const segment = segments[0]

    setTranscriptionSegments((prevSegments) => {
      const existingSegmentIds = new Set(prevSegments.map((s) => s.id))
      if (existingSegmentIds.has(segment.id)) return prevSegments
      return [
        ...prevSegments,
        {
          participant: participant,
          ...segment,
        },
      ]
    })
  }

  return {
    updateTranscriptionSegments,
    transcriptionSegments,
  }
}

const Transcription = ({ row }: { row: TranscriptionRow }) => {
  const participantColor = getParticipantColor(row.participant)
  const participantName = getParticipantName(row.participant)

  const getDisplayText = (row: TranscriptionRow): string => {
    return row.segments
      .filter((segment) => segment.text.trim())
      .map((segment) => segment.text.trim())
      .join(' ')
  }

  const displayText = getDisplayText(row)

  if (!displayText) return null

  return (
    <div
      className={css({
        maxWidth: '800px',
        width: '100%',
      })}
    >
      <div
        className={css({
          display: 'flex',
          gap: '0.5rem',
        })}
      >
        <Avatar
          name={participantName}
          bgColor={participantColor}
          context="subtitles"
        />
        <div
          className={css({
            color: 'white',
            width: '100%',
          })}
        >
          <Text variant="h3" margin={false}>
            {participantName}
          </Text>
          <p
            className={css({
              fontSize: '1.5rem',
              lineHeight: '1.7rem',
              fontWeight: '400',
            })}
          >
            {displayText}
          </p>
        </div>
      </div>
    </div>
  )
}

const SubtitlesWrapper = styled(
  'div',
  cva({
    base: {
      width: '100%',
      paddingTop: 'var(--lk-grid-gap)',
      transition: 'height .5s cubic-bezier(0.4,0,0.2,1) 5ms',
    },
    variants: {
      areOpen: {
        true: {
          height: '12rem',
        },
        false: {
          height: '0',
        },
      },
    },
  })
)

export const Subtitles = () => {
  const { areSubtitlesOpen } = useSubtitles()
  const room = useRoomContext()

  const { transcriptionSegments, updateTranscriptionSegments } =
    useTranscriptionState()

  useEffect(() => {
    if (!room) return
    room.on(RoomEvent.TranscriptionReceived, updateTranscriptionSegments)
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptionSegments)
    }
  }, [room, updateTranscriptionSegments])

  const transcriptionRows = useMemo(() => {
    if (transcriptionSegments.length === 0) return []

    const rows: TranscriptionRow[] = []
    let currentRow: TranscriptionRow | null = null

    for (const segment of transcriptionSegments) {
      const shouldStartNewRow =
        !currentRow ||
        currentRow.participant.identity !== segment.participant.identity

      if (shouldStartNewRow) {
        currentRow = {
          id: `${segment.participant.identity}-${segment.firstReceivedTime}`,
          participant: segment.participant,
          segments: [segment],
          startTime: segment.startTime,
          lastUpdateTime: segment.lastReceivedTime,
          lastReceivedTime: segment.lastReceivedTime,
        }
        rows.push(currentRow)
      } else if (currentRow) {
        currentRow.segments.push(segment)
        currentRow.lastUpdateTime = Math.max(
          currentRow.lastUpdateTime,
          segment.lastReceivedTime
        )
        currentRow.lastReceivedTime = Math.max(
          currentRow.lastReceivedTime,
          segment.lastReceivedTime
        )
      }
    }

    return rows
  }, [transcriptionSegments])

  return (
    <SubtitlesWrapper areOpen={areSubtitlesOpen}>
      <div
        className={css({
          height: '100%',
          width: '100%',
          display: 'flex',
          gap: '1.25rem',
          flexDirection: 'column-reverse',
          overflowAnchor: 'auto',
          overflowY: 'scroll',
          padding: '0 1rem',
          alignItems: 'center',
        })}
      >
        {transcriptionRows
          .slice()
          .reverse()
          .map((row) => (
            <Transcription key={row.id} row={row} />
          ))}
      </div>
    </SubtitlesWrapper>
  )
}

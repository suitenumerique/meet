import { useEffect, useState } from 'react'
import { useSubtitles } from '../hooks/useSubtitles'
import { css, cva } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { Text } from '@/primitives'
import { useRoomContext } from '@livekit/components-react'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { Participant, RoomEvent } from 'livekit-client'

export interface TranscriptionSegment {
  id: string
  text: string
  language: string
  startTime: number
  endTime: number
  final: boolean
  firstReceivedTime: number
  lastReceivedTime: number
}

export interface TranscriptionRow {
  id: string
  participant: Participant
  segments: TranscriptionSegment[]
  startTime: number
  lastUpdateTime: number
}

const getParticipantName = (participant: Participant): string => {
  return participant.name || participant.identity || 'Unknown'
}

const useTranscriptionState = () => {
  // todo - fix update on participant name changed
  const [transcriptionRows, setTranscriptionRows] = useState<
    TranscriptionRow[]
  >([])
  const [lastActiveParticipant, setLastActiveParticipant] =
    useState<Participant | null>(null)

  const updateTranscriptions = (
    segments: TranscriptionSegment[],
    participant?: Participant
  ) => {
    if (!participant || segments.length === 0) return

    setTranscriptionRows((prevRows) => {
      const updatedRows = [...prevRows]
      const now = Date.now()

      // Check if we should append to existing row or create new one
      const shouldAppendToLastRow =
        lastActiveParticipant?.identity === participant.identity &&
        updatedRows.length > 0

      if (shouldAppendToLastRow) {
        // Append to the last row
        const lastRowIndex = updatedRows.length - 1
        const lastRow = updatedRows[lastRowIndex]

        // Merge segments, replacing interim with final versions
        const existingSegmentIds = new Set(lastRow.segments.map((s) => s.id))
        const newSegments = segments.filter(
          (segment) => !existingSegmentIds.has(segment.id)
        )
        const updatedSegments = lastRow.segments.map((existing) => {
          const update = segments.find((s) => s.id === existing.id)
          return update && update.final ? update : existing
        })

        updatedRows[lastRowIndex] = {
          ...lastRow,
          segments: [...updatedSegments, ...newSegments],
          lastUpdateTime: now,
        }
      } else {
        // Create new row
        const newRow: TranscriptionRow = {
          id: `${participant.identity}-${now}`,
          participant,
          segments: [...segments],
          startTime: Math.min(...segments.map((s) => s.startTime)),
          lastUpdateTime: now,
        }
        updatedRows.push(newRow)
      }

      // Keep only recent rows (optional: limit to last N rows or time window)
      const maxRows = 50
      if (updatedRows.length > maxRows) {
        return updatedRows.slice(-maxRows)
      }

      return updatedRows
    })

    setLastActiveParticipant(participant)
  }

  const clearTranscriptions = () => {
    setTranscriptionRows([])
    setLastActiveParticipant(null)
  }

  const getDisplayText = (row: TranscriptionRow): string => {
    return row.segments
      .filter((segment) => segment.text.trim())
      .map((segment) => segment.text.trim())
      .join(' ')
  }

  return {
    transcriptionRows,
    updateTranscriptions,
    clearTranscriptions,
    getDisplayText,
  }
}

const Transcription = ({
  row,
  getDisplayText,
}: {
  row: TranscriptionRow
  getDisplayText: (row: TranscriptionRow) => string
}) => {
  const participantColor = getParticipantColor(row.participant)
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
          name={getParticipantName(row.participant)}
          bgColor={participantColor}
          context="subtitles"
        />
        <div
          className={css({
            // background: 'red',
            color: 'white',
            width: '100%',
          })}
        >
          <Text variant="h3" margin={false}>
            {getParticipantName(row.participant)}
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
  const { transcriptionRows, updateTranscriptions, getDisplayText } =
    useTranscriptionState()

  useEffect(() => {
    if (!room) return
    room.on(RoomEvent.TranscriptionReceived, updateTranscriptions)
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions)
    }
  }, [room, updateTranscriptions])

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
            <Transcription
              key={row.id}
              row={row}
              getDisplayText={getDisplayText}
            />
          ))}
      </div>
    </SubtitlesWrapper>
  )
}

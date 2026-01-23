import { useEffect, useState } from 'react'
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

export interface TranscriptionRow {
  id: string
  participant: Participant
  segments: TranscriptionSegment[]
  startTime?: number
  lastUpdateTime: number
  lastReceivedTime: number
}

const useTranscriptionState = () => {
  const [transcriptionRows, setTranscriptionRows] = useState<
    TranscriptionRow[]
  >([])
  const [lastActiveParticipantIdentity, setLastActiveParticipantIdentity] =
    useState<string | null>(null)

  const updateTranscriptions = (
    segments: TranscriptionSegment[],
    participant?: Participant
  ) => {
    if (!participant || segments.length === 0) return

    setTranscriptionRows((prevRows) => {
      const updatedRows = [...prevRows]
      const now = Date.now()

      const shouldAppendToLastRow =
        lastActiveParticipantIdentity === participant.identity &&
        updatedRows.length > 0

      if (shouldAppendToLastRow) {
        const lastRowIndex = updatedRows.length - 1
        const lastRow = updatedRows[lastRowIndex]

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
        const newRow: TranscriptionRow = {
          id: `${participant.identity}-${now}`,
          participant,
          segments: [...segments],
          lastReceivedTime: Math.min(
            ...segments.map((s) => s.lastReceivedTime)
          ),
          lastUpdateTime: now,
        }
        updatedRows.push(newRow)
      }

      return updatedRows
    })

    setLastActiveParticipantIdentity(participant.identity)
  }

  const clearTranscriptions = () => {
    setTranscriptionRows([])
    setLastActiveParticipantIdentity(null)
  }

  const updateParticipant = (_name: string, participant: Participant) => {
    setTranscriptionRows((prevRows) => {
      return prevRows.map((row) => {
        if (row.participant.identity === participant.identity) {
          return {
            ...row,
            participant,
          }
        }
        return row
      })
    })
  }

  return {
    transcriptionRows,
    updateTranscriptions,
    clearTranscriptions,
    updateParticipant,
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
  const { transcriptionRows, updateTranscriptions, updateParticipant } =
    useTranscriptionState()

  useEffect(() => {
    if (!room) return
    room.on(RoomEvent.TranscriptionReceived, updateTranscriptions)
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions)
    }
  }, [room, updateTranscriptions])

  useEffect(() => {
    if (!room) return
    room.on(RoomEvent.ParticipantNameChanged, updateParticipant)
    return () => {
      room.off(RoomEvent.ParticipantNameChanged, updateParticipant)
    }
  }, [room, updateParticipant])

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
          .sort(
            (a, b) =>
              (b.startTime ?? b.lastUpdateTime) -
              (a.startTime ?? a.lastUpdateTime)
          )
          .map((row) => (
            <Transcription key={row.id} row={row} />
          ))}
      </div>
    </SubtitlesWrapper>
  )
}

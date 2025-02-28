import { Button, Div, H, Text } from '@/primitives'

import thirdSlide from '@/assets/intro-slider/3_resume.png'
import { css } from '@/styled-system/css'

import { useHasTranscriptAccess } from '../hooks/useHasTranscriptAccess'
import { RiRecordCircleLine, RiStopCircleLine } from '@remixicon/react'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useStartRecording,
} from '@/features/rooms/api/startRecording'
import { useStopRecording } from '@/features/rooms/api/stopRecording'
import { useEffect, useState } from 'react'
import { RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'

export const Transcript = () => {
  const [isLoading, setIsLoading] = useState(false)

  const { t } = useTranslation('rooms', { keyPrefix: 'transcript' })

  const hasTranscriptAccess = useHasTranscriptAccess()

  const roomId = useRoomId()

  const { mutateAsync: startRecordingRoom } = useStartRecording()
  const { mutateAsync: stopRecordingRoom } = useStopRecording()

  const room = useRoomContext()

  useEffect(() => {
    const handleRecordingStatusChanged = () => {
      setIsLoading(false)
    }
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    }
  }, [room])

  const handleTranscript = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      setIsLoading(true)
      if (room.isRecording) {
        await stopRecordingRoom({ id: roomId })
      } else {
        await startRecordingRoom({ id: roomId, mode: RecordingMode.Transcript })
      }
    } catch (error) {
      console.error('Failed to handle transcript:', error)
      setIsLoading(false)
    }
  }

  if (!hasTranscriptAccess) return

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
    >
      <img src={thirdSlide} alt={'wip'} />
      {room.isRecording ? (
        <>
          <H lvl={2}>{t('stop.heading')}</H>
          <Text variant="sm" centered wrap="balance">
            {t('stop.body')}
          </Text>
          <div className={css({ height: '2rem' })} />
          <Button
            isDisabled={isLoading}
            onPress={() => handleTranscript()}
            data-attr="stop-transcript"
          >
            <RiStopCircleLine style={{ marginRight: '0.5rem' }} />{' '}
            {t('stop.button')}
          </Button>
        </>
      ) : (
        <>
          <H lvl={2}>{t('start.heading')}</H>
          <Text variant="sm" centered wrap="balance">
            {t('start.body')}
          </Text>
          <div className={css({ height: '2rem' })} />
          <Button
            isDisabled={isLoading}
            onPress={() => handleTranscript()}
            data-attr="start-transcript"
          >
            <RiRecordCircleLine style={{ marginRight: '0.5rem' }} />{' '}
            {t('start.button')}
          </Button>
        </>
      )}
    </Div>
  )
}

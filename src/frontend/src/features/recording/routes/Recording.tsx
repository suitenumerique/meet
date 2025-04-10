import { Center, VStack } from '@/styled-system/jsx'
import { Bold, Button, Field, H, Input, LinkButton, Text } from '@/primitives'
import { Screen } from '@/layout/Screen.tsx'
import { useParams } from 'wouter'
import { fetchRecording } from '../api/fetchRecording'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/primitives/Spinner'
import { UserAware, useUser } from '@/features/auth'
import { CenteredContent } from '@/layout/CenteredContent.tsx'
import { useState } from 'react'
import fourthSlide from '@/assets/intro-slider/4_record.png'
import { css } from '@/styled-system/css'
import { RecordingMode } from '@/features/rooms/api/startRecording.ts'

function formatDate(date, format = 'YYYY-MM-DD') {
  // Accept Date object or create one from string
  const dateObj = date instanceof Date ? date : new Date(date)

  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date'
  }

  const year = dateObj.getFullYear()
  const month = dateObj.getMonth() + 1 // getMonth() returns 0-11
  const day = dateObj.getDate()
  const hours = dateObj.getHours()
  const minutes = dateObj.getMinutes()
  const seconds = dateObj.getSeconds()

  // Pad numbers with leading zeros
  const pad = (num) => String(num).padStart(2, '0')

  // Replace format tokens with actual values
  return format
    .replace('YYYY', year)
    .replace('MM', pad(month))
    .replace('DD', pad(day))
    .replace('HH', pad(hours))
    .replace('mm', pad(minutes))
    .replace('ss', pad(seconds))
}

export const Recording = () => {
  const { recordingId } = useParams()
  const { isLoggedIn } = useUser()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recording', recordingId],
    queryFn: () => fetchRecording({ recordingId }),
    retry: false,
  })

  if (isLoading) {
    return (
      <Screen layout="centered" footer={false}>
        <CenteredContent>
          <Spinner />
        </CenteredContent>
      </Screen>
    )
  }

  if (isError || !isLoggedIn) {
    return (
      <Screen layout="centered" footer={false}>
        <CenteredContent title={'lien invalide'} withBackButton>
          <Text centered>
            Vous ne pouvez pas accéder à ce lien d'enregistrement
          </Text>
        </CenteredContent>
      </Screen>
    )
  }

  return (
    <UserAware>
      <Screen layout="centered" footer={false}>
        <Center>
          <VStack>
            <img
              src={fourthSlide}
              alt={''}
              className={css({
                maxHeight: '309px',
              })}
            />
            <H lvl={1} centered>
              Votre enregistrement est prêt !
            </H>
            <Text centered margin="md">
              Enregistrement de la réunion <b>{data.room.name}</b> du{' '}
              {formatDate(data.created_at, 'YYYY-MM-DD HH:mm')}. <br /> Cet
              enregistrement est disponible <u>pendant 7 jours</u>.
            </Text>
            <LinkButton
              href={`https://meet.127.0.0.1.nip.io/media/recordings/${data.id}.${data.mode == RecordingMode.ScreenRecording ? 'mp4' : 'ogg'}`}
              download={`${data.room.name}-${formatDate(data.created_at)}`}
            >
              Télécharger
            </LinkButton>
          </VStack>
        </Center>
      </Screen>
    </UserAware>
  )
}

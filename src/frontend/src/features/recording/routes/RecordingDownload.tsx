import { useParams } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { Center, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import fourthSlide from '@/assets/intro-slider/4_record.png'
import { mediaUrl } from '@/api/mediaUrl'
import { UserAware, useUser } from '@/features/auth'
import { Screen } from '@/layout/Screen'
import { H, LinkButton, Text } from '@/primitives'
import { formatDate } from '@/utils/formatDate'
import { ErrorScreen } from '@/components/ErrorScreen'
import { LoadingScreen } from '@/components/LoadingScreen'
import { fetchRecording } from '../api/fetchRecording'
import { RecordingStatus } from '@/features/recording'

export const RecordingDownload = () => {
  const { t } = useTranslation('recording')
  const { recordingId } = useParams()
  const { isLoggedIn } = useUser()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recording', recordingId],
    queryFn: () => fetchRecording({ recordingId }),
    retry: false,
    enabled: !!recordingId,
  })

  if (isLoading || !data) {
    return <LoadingScreen />
  }

  if (!isLoggedIn) {
    return (
      <ErrorScreen
        title={t('authentication.title')}
        body={t('authentication.body')}
      />
    )
  }

  if (isError) {
    return <ErrorScreen title={t('error.title')} body={t('error.body')} />
  }

  if (
    data.status !== RecordingStatus.Saved &&
    data.status !== RecordingStatus.NotificationSucceed
  ) {
    return <ErrorScreen title={t('unsaved.title')} body={t('unsaved.body')} />
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
              {t('success.title')}
            </H>
            <Text centered margin="md" wrap={'balance'}>
              <span
                dangerouslySetInnerHTML={{
                  __html: t('success.body', {
                    room: data.room.name,
                    created_at: formatDate(data.created_at, 'YYYY-MM-DD HH:mm'),
                  }),
                }}
              />
            </Text>
            <LinkButton
              href={mediaUrl(data.key)}
              download={`${data.room.name}-${formatDate(data.created_at)}`}
            >
              {t('success.button')}
            </LinkButton>
          </VStack>
        </Center>
      </Screen>
    </UserAware>
  )
}

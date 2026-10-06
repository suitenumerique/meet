import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CenteredContent } from '@/layout/CenteredContent'
import { Screen } from '@/layout/Screen'
import { Center, VStack } from '@/styled-system/jsx'
import { Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { keys } from '@/api/queryKeys'
import { fetchRoomCapacity } from '../api/fetchRoomCapacity'

const SEAT_POLL_INTERVAL = 5000

/**
 * Shown while the meeting is full. Calls onSeatFree once someone has left, so
 * the join is retried; a retry that loses the seat comes back here.
 */
export const WaitingForSeat = ({
  roomId,
  token,
  onSeatFree,
}: {
  roomId: string
  token: string
  onSeatFree: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'error.roomFull' })

  const { data } = useQuery({
    queryKey: [keys.roomCapacity, roomId],
    queryFn: () => fetchRoomCapacity({ roomId, token }),
    refetchInterval: SEAT_POLL_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (data?.is_full === false) onSeatFree()
  }, [data, onSeatFree])

  return (
    <Screen layout="centered">
      <CenteredContent title={t('heading')} withBackButton>
        <VStack gap="1rem">
          <Spinner />
          <Center>
            <Text as="p" variant="h3" centered role="status">
              {t('body')}
            </Text>
          </Center>
        </VStack>
      </CenteredContent>
    </Screen>
  )
}

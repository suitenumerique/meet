import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { VStack } from '@/styled-system/jsx'
import { H } from '@/primitives/H'
import { Field } from '@/primitives/Field'
import { Form, Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { useLoginHint } from '@/hooks/useLoginHint'
import { useUser } from '@/features/auth/api/useUser'
import { useConfig } from '@/api/useConfig'
import { saveUsername, userStore } from '@/stores/user'
import { fetchRoom } from '../api/fetchRoom'
import { ApiAccessLevel } from '../api/ApiRoom'
import { ApiLobbyStatus, type ApiRequestEntry } from '../api/requestEntry'
import { useLobby } from '../hooks/useLobby'


export const Lobby = ({
  roomId,
  enterRoom,
}: {
  roomId: string
  enterRoom: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const { data: configData } = useConfig()
  const { isLoggedIn, user } = useUser()
  const { username } = useSnapshot(userStore)

  // Room data strategy:
  // 1. Initial fetch is performed to check access and get LiveKit configuration
  // 2. Data remains valid for 6 hours to avoid unnecessary refetches
  // 3. State is manually updated via queryClient when a waiting participant is accepted
  // 4. No automatic refetching or revalidation occurs during this period
  const {
    data: roomData,
    error,
    isError,
    refetch: refetchRoom,
  } = useQuery({
    queryKey: [keys.room, roomId],
    queryFn: () => fetchRoom({ roomId, username: username || user?.full_name }),
    staleTime: 6 * 60 * 60 * 1000, // By default, LiveKit access tokens expire 6 hours after generation
    retry: false,
    enabled: false,
  })

  useEffect(() => {
    if (isError && error?.statusCode == 404) {
      // The room component will handle the room creation if the user is authenticated
      enterRoom()
    }
  }, [isError, error, enterRoom])

  const handleAccepted = (response: ApiRequestEntry) => {
    queryClient.setQueryData([keys.room, roomId], {
      ...roomData,
      livekit: response.livekit,
    })
    enterRoom()
  }

  const { status, startWaiting } = useLobby({
    roomId,
    username: username || user?.full_name || 'anonymous',
    onAccepted: handleAccepted,
  })

  const { openLoginHint } = useLoginHint()

  const handleSubmit = async () => {
    const { data } = await refetchRoom()

    if (!data?.livekit) {
      // Display a message to inform the user that by logging in, they won't have to wait for room entry approval.
      if (data?.access_level == ApiAccessLevel.TRUSTED) {
        openLoginHint()
      }
      startWaiting()
      return
    }

    enterRoom()
  }

  switch (status) {
    case ApiLobbyStatus.TIMEOUT:
      return (
        <VStack alignItems="center" textAlign="center">
          <H lvl={1} margin={false} centered>
            {t('timeoutInvite.title')}
          </H>
          <Text as="p" variant="note">
            {t('timeoutInvite.body')}
          </Text>
        </VStack>
      )

    case ApiLobbyStatus.DENIED:
      return (
        <VStack alignItems="center" textAlign="center">
          <H lvl={1} margin={false} centered>
            {t('denied.title')}
          </H>
          <Text as="p" variant="note">
            {t('denied.body')}
          </Text>
        </VStack>
      )

    case ApiLobbyStatus.WAITING:
      return (
        <VStack alignItems="center" textAlign="center">
          <H lvl={1} margin={false} centered>
            {t('waiting.title')}
          </H>
          <Text
            as="p"
            variant="note"
            className={css({ marginBottom: '1.5rem' })}
          >
            {t('waiting.body')}
          </Text>
          <Spinner />
        </VStack>
      )

    default:
      return (
        <Form
          onSubmit={handleSubmit}
          submitLabel={t('joinLabel')}
          submitButtonProps={{
            fullWidth: true,
          }}
        >
          <VStack marginBottom={1}>
            <H lvl={1} margin="sm" centered>
              {t('heading')}
            </H>
            {(!isLoggedIn ||
              configData?.authenticated_users_can_edit_display_name) && (
              <Field
                type="text"
                onChange={saveUsername}
                label={t('usernameLabel')}
                id="input-name"
                defaultValue={username || user?.full_name}
                validate={(value) => !value && t('errors.usernameEmpty')}
                wrapperProps={{
                  noMargin: true,
                  fullWidth: true,
                }}
                autoComplete="name"
                maxLength={50}
              />
            )}
          </VStack>
        </Form>
      )
  }
}

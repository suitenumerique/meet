import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { VStack } from '@/styled-system/jsx'
import { H } from '@/primitives/H'
import { Field } from '@/primitives/Field'
import { Form, Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import type { ApiError } from '@/api/ApiError'
import { useLoginHint } from '@/hooks/useLoginHint'
import { useUser } from '@/features/auth/api/useUser'
import { useConfig } from '@/api/useConfig'
import { saveUsername, userStore } from '@/stores/user'
import { joinRoom, type JoinRoomParams } from '../api/joinRoom'
import { ApiAccessLevel, type ApiRoom } from '../api/ApiRoom'
import { ApiLobbyStatus } from '../api/requestEntry'
import { useLobby } from '../hooks/useLobby'

const LobbyMessage = ({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: ReactNode
}) => (
  <VStack alignItems="center" textAlign="center">
    <H lvl={1} margin={false} centered>
      {title}
    </H>
    <Text
      as="p"
      variant="note"
      className={children ? css({ marginBottom: '1.5rem' }) : undefined}
    >
      {body}
    </Text>
    {children}
  </VStack>
)

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
  const { openLoginHint } = useLoginHint()

  const displayName = username || user?.full_name

  // Join strategy:
  // 1. Submitting the form asks to join the room, which checks access
  // 2. The response is written to the [keys.room] cache entry, which
  //    Conference reuses without refetching. It holds the LiveKit credentials
  //    when the user may bypass the lobby
  // 3. Otherwise the user waits in the lobby, and the credentials returned
  //    once accepted are added to it
  const {
    mutate: join,
    data: roomData,
    error,
    isError,
  } = useMutation<ApiRoom, ApiError, JoinRoomParams>({
    mutationFn: joinRoom,
    onSuccess: (room) => {
      queryClient.setQueryData([keys.room, roomId], room)
    },
    onError: ({ statusCode }) => {
      // The room component will handle the room creation if the user is authenticated
      if (statusCode == 404) enterRoom()
    },
  })

  const { status, startWaiting } = useLobby({
    roomId,
    username: displayName || 'anonymous',
    onAccepted: (response) => {
      queryClient.setQueryData([keys.room, roomId], {
        ...roomData,
        livekit: response.livekit,
      })
      enterRoom()
    },
  })

  const isRoomDeleted = isError && error?.statusCode == 410
  const lobbyStatus = isRoomDeleted ? ApiLobbyStatus.DELETED : status
  const hasJoinFailed = isError && !isRoomDeleted && error?.statusCode != 404

  const handleSubmit = () => {
    join(
      { roomId, username: displayName || undefined },
      {
        onSuccess: (data) => {
          if (data.livekit) {
            enterRoom()
            return
          }
          if (data.access_level == ApiAccessLevel.TRUSTED) {
            openLoginHint()
          }
          startWaiting()
        },
      }
    )
  }

  switch (lobbyStatus) {
    case ApiLobbyStatus.DELETED:
      return (
        <LobbyMessage title={t('deleted.title')} body={t('deleted.body')} />
      )

    case ApiLobbyStatus.TIMEOUT:
      return (
        <LobbyMessage
          title={t('timeoutInvite.title')}
          body={t('timeoutInvite.body')}
        />
      )

    case ApiLobbyStatus.DENIED:
      return <LobbyMessage title={t('denied.title')} body={t('denied.body')} />

    case ApiLobbyStatus.WAITING:
      return (
        <LobbyMessage title={t('waiting.title')} body={t('waiting.body')}>
          <Spinner />
        </LobbyMessage>
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
                aria-label={t('usernameLabel')}
                id="input-name"
                defaultValue={displayName}
                validate={(value) => !value && t('errors.usernameEmpty')}
                wrapperProps={{
                  noMargin: true,
                  fullWidth: true,
                }}
                autoComplete="name"
                maxLength={50}
              />
            )}
            {hasJoinFailed && (
              <Text variant="warning" role="alert" margin={false} centered>
                {t('errors.joinFailed')}
              </Text>
            )}
          </VStack>
        </Form>
      )
  }
}

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LiveKitRoom } from '@livekit/components-react'
import {
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomOptions,
} from 'livekit-client'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { Screen } from '@/layout/Screen'
import { QueryAware } from '@/components/QueryAware'
import { ErrorScreen } from '@/components/ErrorScreen'
import { fetchRoom } from '../api/fetchRoom'
import { ApiRoom } from '../api/ApiRoom'
import { useCreateRoom } from '../api/createRoom'
import { InviteDialog } from './InviteDialog'
import { VideoConference } from '../livekit/prefabs/VideoConference'
import { css } from '@/styled-system/css'
import { BackgroundProcessorFactory } from '../livekit/components/blur'
import { LocalUserChoices } from '@/stores/userChoices'
import { navigateTo } from '@/navigation/navigateTo'
import { MediaDeviceErrorAlert } from './MediaDeviceErrorAlert'
import { usePostHog } from 'posthog-js/react'
import { useConfig } from '@/api/useConfig'

export const Conference = ({
  roomId,
  userConfig,
  initialRoomData,
  mode = 'join',
}: {
  roomId: string
  userConfig: LocalUserChoices
  mode?: 'join' | 'create'
  initialRoomData?: ApiRoom
}) => {
  const posthog = usePostHog()
  const { data: apiConfig } = useConfig()

  useEffect(() => {
    posthog.capture('visit-room', { slug: roomId })
  }, [roomId, posthog])
  const fetchKey = [keys.room, roomId]

  const [isConnectionWarmedUp, setIsConnectionWarmedUp] = useState(false)

  const {
    mutateAsync: createRoom,
    status: createStatus,
    isError: isCreateError,
  } = useCreateRoom({
    onSuccess: (data) => {
      queryClient.setQueryData(fetchKey, data)
    },
  })

  /**
   * Warm up connection to LiveKit server before joining room
   * This prefetch helps reduce initial connection latency by establishing
   * an early HTTP connection to the WebRTC signaling server
   *
   * FIREFOX + PROXY WORKAROUND:
   * On Firefox behind proxy configurations, WebSocket signaling fails to establish.
   * Client receives HTTP 200 instead of expected 101 (Switching Protocols).
   * This appears to be a certificate/security issue where the initial request
   * is considered unsecure. By first calling the signaling server via HTTPS,
   * subsequent WebSocket establishment works correctly in these setups.
   * This is a temporary workaround - issue is reproducible on LiveKit's demo app.
   */
  useEffect(() => {
    const warmUpLivekitConnection = async () => {
      if (isConnectionWarmedUp || !apiConfig) return
      try {
        // Make a lightweight HTTPS request to establish secure connection
        // This resolves Firefox+proxy WebSocket handshake issues
        await fetch(apiConfig.livekit.url, { method: 'HEAD' })
        setIsConnectionWarmedUp(true)
      } catch (error) {
        // Don't block room connection if warmup fails
        console.warn('LiveKit connection warmup failed:', error)
        setIsConnectionWarmedUp(true)
      }
    }
    warmUpLivekitConnection()
  }, [isConnectionWarmedUp, apiConfig])

  const {
    status: fetchStatus,
    isError: isFetchError,
    data,
  } = useQuery({
    /* eslint-disable @tanstack/query/exhaustive-deps */
    queryKey: fetchKey,
    staleTime: 6 * 60 * 60 * 1000, // By default, LiveKit access tokens expire 6 hours after generation
    initialData: initialRoomData,
    queryFn: () =>
      fetchRoom({
        roomId: roomId as string,
        username: userConfig.username,
      }).catch((error) => {
        if (error.statusCode == '404') {
          createRoom({ slug: roomId, username: userConfig.username })
        }
      }),
    retry: false,
  })

  const roomOptions = useMemo((): RoomOptions => {
    return {
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoCodec: 'vp9',
      },
      videoCaptureDefaults: {
        deviceId: userConfig.videoDeviceId ?? undefined,
      },
      audioCaptureDefaults: {
        deviceId: userConfig.audioDeviceId ?? undefined,
      },
    }
    // do not rely on the userConfig object directly as its reference may change on every render
  }, [userConfig.videoDeviceId, userConfig.audioDeviceId])

  const room = useMemo(() => new Room(roomOptions), [roomOptions])

  const [showInviteDialog, setShowInviteDialog] = useState(mode === 'create')
  const [mediaDeviceError, setMediaDeviceError] = useState<{
    error: MediaDeviceFailure | null
    kind: MediaDeviceKind | null
  }>({
    error: null,
    kind: null,
  })

  const { t } = useTranslation('rooms')
  if (isCreateError) {
    // this error screen should be replaced by a proper waiting room for anonymous user.
    return (
      <ErrorScreen
        title={t('error.createRoom.heading')}
        body={t('error.createRoom.body')}
      />
    )
  }

  // Some clients (like DINUM) operate in bandwidth-constrained environments
  // These settings help ensure successful connections in poor network conditions
  const connectOptions = {
    maxRetries: 5, // Default: 1. Only for unreachable server scenarios
    peerConnectionTimeout: 60000, // Default: 15s. Extended for slow TURN/TLS negotiation
  }

  return (
    <QueryAware status={isFetchError ? createStatus : fetchStatus}>
      <Screen header={false} footer={false}>
        <LiveKitRoom
          room={room}
          serverUrl={apiConfig?.livekit.url}
          token={data?.livekit?.token}
          connect={isConnectionWarmedUp}
          audio={userConfig.audioEnabled}
          video={
            userConfig.videoEnabled && {
              processor: BackgroundProcessorFactory.deserializeProcessor(
                userConfig.processorSerialized
              ),
            }
          }
          connectOptions={connectOptions}
          className={css({
            backgroundColor: 'primaryDark.50 !important',
          })}
          onError={(e) => {
            posthog.captureException(e)
          }}
          onDisconnected={(e) => {
            if (e == DisconnectReason.CLIENT_INITIATED) {
              navigateTo('feedback', { duplicateIdentity: false })
            } else if (e == DisconnectReason.DUPLICATE_IDENTITY) {
              navigateTo('feedback', { duplicateIdentity: true })
            }
          }}
          onMediaDeviceFailure={(e, kind) => {
            if (e == MediaDeviceFailure.DeviceInUse && !!kind) {
              setMediaDeviceError({ error: e, kind })
            }
          }}
        >
          <VideoConference />
          {showInviteDialog && (
            <InviteDialog
              isOpen={showInviteDialog}
              onOpenChange={setShowInviteDialog}
              roomId={roomId}
              onClose={() => setShowInviteDialog(false)}
            />
          )}
          <MediaDeviceErrorAlert
            {...mediaDeviceError}
            onClose={() => setMediaDeviceError({ error: null, kind: null })}
          />
        </LiveKitRoom>
      </Screen>
    </QueryAware>
  )
}

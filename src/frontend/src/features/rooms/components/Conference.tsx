import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LiveKitRoom,
  usePersistentUserChoices,
} from '@livekit/components-react'
import {
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomOptions,
  supportsAdaptiveStream,
  supportsDynacast,
  VideoPresets,
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
import { isFireFox } from '@/utils/livekit'

export const Conference = ({
  roomId,
  initialRoomData,
  mode = 'join',
}: {
  roomId: string
  mode?: 'join' | 'create'
  initialRoomData?: ApiRoom
}) => {
  const posthog = usePostHog()
  const { data: apiConfig } = useConfig()

  const { userChoices: userConfig } = usePersistentUserChoices() as {
    userChoices: LocalUserChoices
  }

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

  const isAdaptiveStreamSupported = supportsAdaptiveStream()
  const isDynacastSupported = supportsDynacast()

  const roomOptions = useMemo((): RoomOptions => {
    return {
      adaptiveStream: isAdaptiveStreamSupported,
      dynacast: isDynacastSupported,
      publishDefaults: {
        videoCodec: 'vp9',
      },
      videoCaptureDefaults: {
        deviceId: userConfig.videoDeviceId ?? undefined,
        resolution: userConfig.videoPublishResolution
          ? VideoPresets[userConfig.videoPublishResolution].resolution
          : undefined,
      },
      audioCaptureDefaults: {
        deviceId: userConfig.audioDeviceId ?? undefined,
      },
      audioOutput: {
        deviceId: userConfig.audioOutputDeviceId ?? undefined,
      },
    }
    // do not rely on the userConfig object directly as its reference may change on every render
  }, [
    userConfig.videoDeviceId,
    userConfig.videoPublishResolution,
    userConfig.audioDeviceId,
    userConfig.audioOutputDeviceId,
    isAdaptiveStreamSupported,
    isDynacastSupported,
  ])

  const room = useMemo(() => new Room(roomOptions), [roomOptions])

  useEffect(() => {
    /**
     * Warm up connection to LiveKit server before joining room
     * This prefetch helps reduce initial connection latency by establishing
     * an early HTTP connection to the WebRTC signaling server
     *
     * It should cache DNS and TLS keys.
     */
    const prepareConnection = async () => {
      if (!apiConfig || isConnectionWarmedUp) return
      await room.prepareConnection(apiConfig.livekit.url)

      if (isFireFox() && apiConfig.livekit.enable_firefox_proxy_workaround) {
        try {
          const wssUrl =
            apiConfig.livekit.url
              .replace('https://', 'wss://')
              .replace(/\/$/, '') + '/rtc'

          /**
           * FIREFOX + PROXY WORKAROUND:
           *
           * Issue: On Firefox behind proxy configurations, WebSocket signaling fails to establish.
           * Symptom: Client receives HTTP 200 instead of expected 101 (Switching Protocols).
           * Root Cause: Certificate/security issue where the initial request is considered unsecure.
           *
           * Solution: Pre-establish a WebSocket connection to the signaling server, which fails.
           * This "primes" the connection, allowing subsequent WebSocket establishments to work correctly.
           *
           * Note: This issue is reproducible on LiveKit's demo app.
           * Reference: livekit-examples/meet/issues/466
           */
          const ws = new WebSocket(wssUrl)
          // 401 unauthorized response is expected
          ws.onerror = () => ws.readyState <= 1 && ws.close()
        } catch (e) {
          console.debug('Firefox WebSocket workaround failed.', e)
        }
      }

      setIsConnectionWarmedUp(true)
    }
    prepareConnection()
  }, [room, apiConfig, isConnectionWarmedUp])

  const [showInviteDialog, setShowInviteDialog] = useState(mode === 'create')
  const [mediaDeviceError, setMediaDeviceError] = useState<{
    error: MediaDeviceFailure | null
    kind: MediaDeviceKind | null
  }>({
    error: null,
    kind: null,
  })

  /*
   * Ensure stable WebSocket connection URL. This is critical for legacy browser compatibility
   * (Firefox <124, Chrome <125, Edge <125) where HTTPS URLs in WebSocket() constructor
   *  may fail - the force_wss_protocol flag allows explicit WSS protocol conversion
   */
  const serverUrl = useMemo(() => {
    const livekit_url = apiConfig?.livekit.url
    if (!livekit_url) return
    if (apiConfig?.livekit.force_wss_protocol) {
      return livekit_url.replace('https://', 'wss://')
    }
    return livekit_url
  }, [apiConfig?.livekit])

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
          serverUrl={serverUrl}
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

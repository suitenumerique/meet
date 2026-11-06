import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LiveKitRoom,
  usePersistentUserChoices,
} from '@livekit/components-react'
import {
  ConnectionError,
  ConnectionErrorReason,
  DisconnectReason,
  MediaDeviceFailure,
  type Room,
  type RoomOptions,
  VideoPresets,
} from 'livekit-client'
import { getMediaDeviceFailure } from '@/features/rooms/livekit/utils/mediaPermissions'
import { keys } from '@/api/queryKeys'
import { Screen } from '@/layout/Screen'
import { QueryAware } from '@/components/QueryAware'
import { ErrorScreen } from '@/components/ErrorScreen'
import { joinRoom } from '../api/joinRoom'
import { useCreateRoom } from '../api/createRoom'
import { InviteDialog } from './InviteDialog'
import { VideoConference } from '../livekit/prefabs/VideoConference'
import { css } from '@/styled-system/css'
import { BackgroundProcessorFactory } from '../livekit/components/blur'
import { LocalUserChoices } from '@/stores/userChoices'
import {
  captureEvent,
  captureMediaEvent,
  reportError,
} from '@/features/analytics/telemetry'
import { type ApiConfig, useConfig } from '@/api/useConfig'
import { isFireFox } from '@/utils/livekit'
import { useIsMobile } from '@/utils/useIsMobile'
import { navigateTo } from '@/navigation/navigateTo'
import { PictureInPictureConference } from '@/features/pip/components/PictureInPictureConference'
import { notifyAutoMutedOnJoin } from '@/features/notifications/utils'
import { useSnapshot } from 'valtio'
import { userPreferencesStore } from '@/stores/userPreferences'
import { userStore } from '@/stores/user'
import { WatchMediaDeviceErrors } from './WatchMediaDeviceErrors'
import { AwayMediaGuard } from '@/features/rooms/livekit/components/AwayMediaGuard'
import { MeetDevtools } from '@/features/devtools'
import { VOICE_AUDIO_CONSTRAINTS } from '@/features/rooms/livekit/utils/constants'
import { resolveAudioOutputDeviceId } from '@/features/rooms/utils/resolveAudioOutputDeviceId'
import { ConnectionEndReason } from '@/features/rooms/utils/connectionEndReason'
import { createLiveKitRoom } from '@/features/rooms/livekit/utils/reconnectPolicy'

// Some clients (like DINUM) operate in bandwidth-constrained environments
// These settings help ensure successful connections in poor network conditions
const connectOptions = {
  maxRetries: 5, // Default: 1. Only for unreachable server scenarios
  peerConnectionTimeout: 60000, // Default: 15s. Extended for slow TURN/TLS negotiation
}

const handleError = (e: Error) => {
  const failure = getMediaDeviceFailure(e)
  if (failure && failure !== MediaDeviceFailure.Other) return

  // connect() was aborted by a disconnect() before the join completed
  if (
    e instanceof ConnectionError &&
    e.reason === ConnectionErrorReason.Cancelled
  ) {
    void captureEvent('connection-cancelled')
    return
  }

  reportError('livekit_room_error', e, {
    path: 'connect_publish',
  })
}

/**
 * Warm up connection to LiveKit server before joining room
 * This prefetch helps reduce initial connection latency by establishing
 * an early HTTP connection to the WebRTC signaling server
 *
 * It should cache DNS and TLS keys.
 */
const warmUpConnection = async (room: Room, livekit: ApiConfig['livekit']) => {
  await room.prepareConnection(livekit.url)

  if (isFireFox() && livekit.enable_firefox_proxy_workaround) {
    try {
      const wssUrl =
        livekit.url.replace('https://', 'wss://').replace(/\/$/, '') + '/rtc'

      /**
       * FIREFOX + PROXY WORKAROUND:
       *
       * Issue: On Firefox behind proxy configurations, WebSocket signaling fails to establish.
       * Symptom: Client receives HTTP 200 instead of expected 101 (Switching Protocols).
       * Root Cause: Certificate/security issue where the initial request is considered insecure.
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
}

const getConnectionEndReason = (
  reason: DisconnectReason | undefined,
  hasConnected: boolean
) => {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return undefined
    case DisconnectReason.DUPLICATE_IDENTITY:
    case DisconnectReason.PARTICIPANT_REMOVED:
    case DisconnectReason.ROOM_DELETED:
      return reason
    default:
      // Reconnecting gave up, or the join itself failed
      return hasConnected
        ? ConnectionEndReason.Lost
        : ConnectionEndReason.Failed
  }
}

export const Conference = ({
  roomId,
  mode = 'join',
  onLobbyRequired,
}: {
  roomId: string
  mode?: 'join' | 'create'
  onLobbyRequired: () => void
}) => {
  const { t } = useTranslation('rooms')
  const { data: apiConfig } = useConfig()
  const { userChoices: userConfig } = usePersistentUserChoices() as {
    userChoices: LocalUserChoices
  }
  const { username } = useSnapshot(userStore)
  const userPreferencesSnap = useSnapshot(userPreferencesStore)
  const isMobile = useIsMobile()

  const [hasJoined, setHasJoined] = useState(false)
  const [isConnectionWarmedUp, setIsConnectionWarmedUp] = useState(false)
  const hasAutoMutedRef = useRef(false)
  const hasConnectedRef = useRef(false)

  const { mutateAsync: createRoom, isError: isCreateError } = useCreateRoom()
  const {
    status: fetchStatus,
    error: fetchError,
    data: createRoomData,
  } = useQuery({
    queryKey: [keys.room, roomId],
    staleTime: 6 * 60 * 60 * 1000, // By default, LiveKit access tokens expire 6 hours after generation
    queryFn: () =>
      joinRoom({ roomId, username }).catch(async (error) => {
        if (error.statusCode != 404) throw error
        await createRoom({ slug: roomId })
        return joinRoom({ roomId, username })
      }),
    retry: false,
  })

  const isLobbyRequired =
    !!createRoomData && !createRoomData.livekit && !hasJoined
  const status =
    createRoomData?.livekit || hasJoined
      ? 'success'
      : isLobbyRequired
        ? 'pending'
        : fetchStatus

  const roomOptions = useMemo((): RoomOptions => {
    return {
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoCodec: apiConfig?.livekit.default_video_codec ?? 'vp9',
      },
      videoCaptureDefaults: {
        deviceId: userConfig.videoDeviceId ?? undefined,
        resolution: userConfig.videoPublishResolution
          ? VideoPresets[userConfig.videoPublishResolution].resolution
          : undefined,
      },
      audioCaptureDefaults: {
        deviceId: userConfig.audioDeviceId ?? undefined,
        ...VOICE_AUDIO_CONSTRAINTS,
      },
      audioOutput: {
        deviceId: resolveAudioOutputDeviceId(userConfig.audioOutputDeviceId),
      },
    }
    // do not rely on the userConfig object directly as its reference may change on every render
  }, [
    userConfig.videoDeviceId,
    userConfig.videoPublishResolution,
    userConfig.audioDeviceId,
    userConfig.audioOutputDeviceId,
    apiConfig?.livekit.default_video_codec,
  ])

  const room = useMemo(
    () => createLiveKitRoom(roomOptions, apiConfig?.livekit.reconnect),
    [roomOptions, apiConfig?.livekit.reconnect]
  )

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

  const handleConnected = useCallback(async () => {
    hasConnectedRef.current = true
    if (!apiConfig) return
    if (
      userPreferencesSnap.is_auto_mute_large_room_enabled &&
      !hasAutoMutedRef.current &&
      userConfig.audioEnabled &&
      room.numParticipants > apiConfig.auto_mute_on_join_threshold
    ) {
      hasAutoMutedRef.current = true
      await room.localParticipant.setMicrophoneEnabled(false)
      notifyAutoMutedOnJoin()
    }
  }, [
    apiConfig,
    room,
    userConfig.audioEnabled,
    userPreferencesSnap.is_auto_mute_large_room_enabled,
  ])

  const handleDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      navigateTo(
        'feedback',
        {},
        {
          state: {
            reason: getConnectionEndReason(reason, hasConnectedRef.current),
            room_id: roomId,
          },
        }
      )
    },
    [roomId]
  )

  useEffect(() => {
    void captureMediaEvent('visit-room', { slug: roomId })
  }, [roomId])

  useEffect(() => {
    if (createRoomData?.livekit) setHasJoined(true)
  }, [createRoomData?.livekit])

  useEffect(() => {
    if (isLobbyRequired) onLobbyRequired()
  }, [isLobbyRequired, onLobbyRequired])

  useEffect(() => {
    if (!apiConfig || isConnectionWarmedUp) return
    warmUpConnection(room, apiConfig.livekit).then(() =>
      setIsConnectionWarmedUp(true)
    )
  }, [room, apiConfig, isConnectionWarmedUp])

  if (fetchError?.statusCode == 410) {
    return (
      <ErrorScreen
        title={t('error.deletedRoom.heading')}
        body={t('error.deletedRoom.body')}
      />
    )
  }

  if (isCreateError) {
    // this error screen should be replaced by a proper waiting room for anonymous user.
    return (
      <ErrorScreen
        title={t('error.createRoom.heading')}
        body={t('error.createRoom.body')}
      />
    )
  }

  return (
    <QueryAware status={status}>
      <Screen header={false} footer={false}>
        <LiveKitRoom
          room={room}
          serverUrl={serverUrl}
          token={createRoomData?.livekit?.token}
          connect={isConnectionWarmedUp}
          audio={userConfig.audioEnabled}
          video={
            userConfig.videoEnabled && {
              processor: BackgroundProcessorFactory.fromProcessorConfig(
                userConfig.processorConfig
              ),
            }
          }
          connectOptions={connectOptions}
          className={css({
            backgroundColor: 'primaryDark.50 !important',
          })}
          onError={handleError}
          onConnected={handleConnected}
          onDisconnected={handleDisconnected}
        >
          <AwayMediaGuard />
          <WatchMediaDeviceErrors />
          <VideoConference />
          {!isMobile && <InviteDialog mode={mode} />}
          <PictureInPictureConference />
          <MeetDevtools />
        </LiveKitRoom>
      </Screen>
    </QueryAware>
  )
}

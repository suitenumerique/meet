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
  MediaDeviceFailure,
  type Room,
  type RoomOptions,
  VideoPresets,
} from 'livekit-client'
import { getMediaDeviceFailure } from '@/features/rooms/livekit/utils/mediaPermissions'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { Screen } from '@/layout/Screen'
import { QueryAware } from '@/components/QueryAware'
import { ErrorScreen } from '@/components/ErrorScreen'
import { joinRoom } from '../api/joinRoom'
import type { ApiLiveKit } from '../api/ApiRoom'
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
import { useConfig } from '@/api/useConfig'
import { isFireFox } from '@/utils/livekit'
import { useIsMobile } from '@/utils/useIsMobile'
import { PictureInPictureConference } from '@/features/pip/components/PictureInPictureConference'
import { notifyAutoMutedOnJoin } from '@/features/notifications/utils'
import { useSnapshot } from 'valtio'
import { userPreferencesStore } from '@/stores/userPreferences'
import { userStore } from '@/stores/user'
import { WatchMediaDeviceErrors } from './WatchMediaDeviceErrors'
import { MeetDevtools } from '@/features/devtools'
import { VOICE_AUDIO_CONSTRAINTS } from '@/features/rooms/livekit/utils/constants'
import { resolveAudioOutputDeviceId } from '@/features/rooms/utils/resolveAudioOutputDeviceId'
import { createLiveKitRoom } from '@/features/rooms/livekit/utils/reconnectPolicy'
import {
  getUrlToWarmUp,
  shouldConnect,
  toConnectionUrl,
} from '@/features/rooms/livekit/utils/clusterConnection'
import { useConnectionRecovery } from '../hooks/useConnectionRecovery'
import { ConnectionRecoveryDialog } from './ConnectionRecoveryDialog'

// Some clients (like DINUM) operate in bandwidth-constrained environments
// These settings help ensure successful connections in poor network conditions
const connectOptions = {
  maxRetries: 5, // Default: 1. Only for unreachable server scenarios
  peerConnectionTimeout: 60000, // Default: 15s. Extended for slow TURN/TLS negotiation
}

const WARM_UP_TIMEOUT_MS = 5_000

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

const handleErrorWithRecovery = (e: Error) => {
  if (
    e instanceof ConnectionError &&
    e.reason === ConnectionErrorReason.NotAllowed &&
    e.status === 404
  ) {
    return
  }
  handleError(e)
}

/**
 * Warm up connection to LiveKit server before joining room
 * This prefetch helps reduce initial connection latency by establishing
 * an early HTTP connection to the WebRTC signaling server
 *
 * It should cache DNS and TLS keys. It is waited for WARM_UP_TIMEOUT_MS at
 * most, so that an unreachable cluster delays the connection by that much only.
 */
const warmUpConnection = async (
  room: Room,
  url: string,
  enableFirefoxProxyWorkaround: boolean
) => {
  const startedAt = performance.now()
  const timedOut = await Promise.race([
    room.prepareConnection(url).then(() => false),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(true), WARM_UP_TIMEOUT_MS)
    ),
  ])
  captureEvent('connection-warm-up', {
    timed_out: timedOut,
    duration_ms: Math.round(performance.now() - startedAt),
  })

  if (isFireFox() && enableFirefoxProxyWorkaround) {
    try {
      const wssUrl =
        url.replace('https://', 'wss://').replace(/\/$/, '') + '/rtc'

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
  const [warmedUpUrls, setWarmedUpUrls] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [pinnedLiveKit, setPinnedLiveKit] = useState<ApiLiveKit>()
  const startedWarmUpsRef = useRef(new Set<string>())
  const [hasConnected, setHasConnected] = useState(false)
  const hasCheckedAutoMuteRef = useRef(false)
  const spentRef = useRef(false)
  const isRecoveryEnabled = apiConfig?.livekit.connection_recovery === true
  const joinRequest = isRecoveryEnabled
    ? ({ kind: 'locate' } as const)
    : undefined

  const { mutateAsync: createRoom, isError: isCreateError } = useCreateRoom()
  const {
    status: fetchStatus,
    error: fetchError,
    data: createRoomData,
  } = useQuery({
    queryKey: [keys.room, roomId],
    staleTime: 6 * 60 * 60 * 1000, // By default, LiveKit access tokens expire 6 hours after generation
    queryFn: () =>
      joinRoom({ roomId, username, request: joinRequest }).catch(
        async (error) => {
          if (error.statusCode != 404) throw error
          await createRoom({ slug: roomId })
          return joinRoom({ roomId, username, request: joinRequest })
        }
      ),
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

  const connection = {
    configUrl: apiConfig?.livekit.url,
    joinUrl: createRoomData?.livekit?.url,
    warmedUpUrls,
    isConnectLatched: pinnedLiveKit !== undefined,
  }
  const urlToWarmUp = getUrlToWarmUp(connection)
  const connect = shouldConnect(connection)
  const liveKit = pinnedLiveKit ?? createRoomData?.livekit
  const serverUrl =
    liveKit &&
    toConnectionUrl(liveKit.url, apiConfig?.livekit.force_wss_protocol ?? false)

  const connectToCluster = useCallback(
    async (livekit: ApiLiveKit, signal: AbortSignal) => {
      if (!apiConfig) throw new Error('The config is not loaded')
      if (!startedWarmUpsRef.current.has(livekit.url)) {
        startedWarmUpsRef.current.add(livekit.url)
        await warmUpConnection(
          room,
          livekit.url,
          apiConfig.livekit.enable_firefox_proxy_workaround
        )
      }
      if (signal.aborted) return
      await room
        .connect(
          toConnectionUrl(livekit.url, apiConfig.livekit.force_wss_protocol),
          livekit.token,
          connectOptions
        )
        .catch((error) => {
          handleErrorWithRecovery(error)
          throw error
        })
    },
    [apiConfig, room]
  )

  const recovery = useConnectionRecovery({
    room,
    roomId,
    isEnabled: isRecoveryEnabled,
    initialCredentials: pinnedLiveKit,
    connect: connectToCluster,
    onLobbyRequired,
  })

  const handleConnected = useCallback(async () => {
    spentRef.current = true
    setHasConnected(true)
    if (!apiConfig || hasCheckedAutoMuteRef.current) return
    hasCheckedAutoMuteRef.current = true
    if (
      userPreferencesSnap.is_auto_mute_large_room_enabled &&
      userConfig.audioEnabled &&
      room.numParticipants > apiConfig.auto_mute_on_join_threshold
    ) {
      await room.localParticipant.setMicrophoneEnabled(false)
      notifyAutoMutedOnJoin()
    }
  }, [
    apiConfig,
    room,
    userConfig.audioEnabled,
    userPreferencesSnap.is_auto_mute_large_room_enabled,
  ])

  const handleDisconnected = useCallback(() => {
    spentRef.current = true
  }, [])

  useEffect(() => {
    void captureMediaEvent('visit-room', { slug: roomId })
  }, [roomId])

  useEffect(
    () => () => {
      if (!spentRef.current) return
      queryClient.removeQueries({ queryKey: [keys.room, roomId], exact: true })
    },
    [roomId]
  )

  useEffect(() => {
    if (createRoomData?.livekit) setHasJoined(true)
  }, [createRoomData?.livekit])

  useEffect(() => {
    if (isLobbyRequired) onLobbyRequired()
  }, [isLobbyRequired, onLobbyRequired])

  useEffect(() => {
    if (!apiConfig || !urlToWarmUp) return
    if (startedWarmUpsRef.current.has(urlToWarmUp)) return
    startedWarmUpsRef.current.add(urlToWarmUp)
    warmUpConnection(
      room,
      urlToWarmUp,
      apiConfig.livekit.enable_firefox_proxy_workaround
    ).finally(() => setWarmedUpUrls((urls) => new Set(urls).add(urlToWarmUp)))
  }, [room, apiConfig, urlToWarmUp])

  useEffect(() => {
    if (connect) setPinnedLiveKit((pinned) => pinned ?? createRoomData?.livekit)
  }, [connect, createRoomData?.livekit])

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
          token={liveKit?.token}
          connect={connect}
          audio={!hasConnected && userConfig.audioEnabled}
          video={
            !hasConnected &&
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
          onError={isRecoveryEnabled ? handleErrorWithRecovery : handleError}
          onConnected={handleConnected}
          onDisconnected={handleDisconnected}
        >
          <WatchMediaDeviceErrors />
          <VideoConference />
          <ConnectionRecoveryDialog onLeave={recovery.leave} />
          {!isMobile && <InviteDialog mode={mode} />}
          <PictureInPictureConference />
          <MeetDevtools />
        </LiveKitRoom>
      </Screen>
    </QueryAware>
  )
}

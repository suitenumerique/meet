import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LiveKitRoom,
  usePersistentUserChoices,
} from '@livekit/components-react'
import {
  DisconnectReason,
  ExternalE2EEKeyProvider,
  MediaDeviceFailure,
  Room,
  RoomOptions,
  VideoPresets,
} from 'livekit-client'
import { EncryptionSetupOverlay, EncryptionProvider } from '@/features/encryption'
import { InCallKeyExchange } from '@/features/encryption/InCallKeyExchange'
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
import { MediaDeviceErrorAlert } from './MediaDeviceErrorAlert'
import { usePostHog } from 'posthog-js/react'
import { useConfig } from '@/api/useConfig'
import { isFireFox } from '@/utils/livekit'
import { useIsMobile } from '@/utils/useIsMobile'
import { navigateTo } from '@/navigation/navigateTo'

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

  const encryptionEnabled = data?.encryption_enabled ?? false

  // Encryption setup — PoC approach: refs for keyProvider and worker,
  // passed directly to RoomOptions.e2ee at Room construction time.
  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const [encryptionSetupComplete, setEncryptionSetupComplete] = useState(!encryptionEnabled)
  const [encryptionError, setEncryptionError] = useState<string | null>(null)
  const [pendingParticipants, setPendingParticipants] = useState<Set<string>>(new Set())

  const getKeyProvider = () => {
    if (!keyProviderRef.current && encryptionEnabled) {
      keyProviderRef.current = new ExternalE2EEKeyProvider()
    }
    return keyProviderRef.current
  }

  const getWorker = () => {
    if (!workerRef.current && encryptionEnabled && typeof window !== 'undefined') {
      workerRef.current = new Worker(
        new URL('livekit-client/e2ee-worker', import.meta.url)
      )
    }
    return workerRef.current
  }

  const roomOptions = useMemo((): RoomOptions => {
    const worker = getWorker()
    const keyProvider = getKeyProvider()

    return {
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoCodec: encryptionEnabled ? undefined : 'vp9',
        red: !encryptionEnabled,
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
      e2ee: encryptionEnabled && keyProvider && worker
        ? { keyProvider, worker }
        : undefined,
    }
    // do not rely on the userConfig object directly as its reference may change on every render
  }, [
    encryptionEnabled,
    userConfig.videoDeviceId,
    userConfig.videoPublishResolution,
    userConfig.audioDeviceId,
    userConfig.audioOutputDeviceId,
  ])

  const room = useMemo(() => new Room(roomOptions), [roomOptions])

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

  // Encryption key exchange — no disconnect/reconnect:
  // Admin: generate passphrase → setKey → setE2EEEnabled → connect → distribute key
  // Joiner: connect (audio/video blocked) → receive key → setKey → setE2EEEnabled → unblock audio/video
  const isAdmin = mode === 'create' || data?.is_administrable === true
  const keyExchangeRef = useRef<InCallKeyExchange | null>(null)
  const keyExchangeDoneRef = useRef(false)
  const adminPassphraseRef = useRef<string | null>(null)
  const adminDistributingRef = useRef(false)
  const [encryptionKeyReady, setEncryptionKeyReady] = useState(!encryptionEnabled)

  useEffect(() => {
    if (!encryptionEnabled || encryptionSetupComplete) return
    const keyProvider = getKeyProvider()
    if (!keyProvider) return

    if (isAdmin) {
      // Generate passphrase once (React Strict Mode runs effects twice)
      if (!adminPassphraseRef.current) {
        adminPassphraseRef.current = Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map((b) => b.toString(36).padStart(2, '0'))
          .join('')
      }
      const passphrase = adminPassphraseRef.current
      console.info('[Encryption] Admin passphrase:', passphrase)

      // Set key before connecting — it's ready for when E2EE activates
      keyProvider
        .setKey(passphrase)
        .then(() => {
          console.info('[Encryption] Admin: key set, allowing connection')
          setEncryptionSetupComplete(true) // allow connection

          // Enable E2EE and start key distribution after connecting
          const onConnected = async () => {
            try {
              await room.setE2EEEnabled(true)
              console.info('[Encryption] Admin: E2EE enabled after connection')
              setEncryptionKeyReady(true)

              if (!adminDistributingRef.current) {
                adminDistributingRef.current = true
                const kx = new InCallKeyExchange(room)
                keyExchangeRef.current = kx
                kx.setSymmetricKey(new TextEncoder().encode(passphrase))
                kx.startListening()
                console.info('[Encryption] Admin: distributing key')
              }
            } catch (err) {
              console.error('[Encryption] Admin: E2EE enable failed:', err)
              setEncryptionError((err as Error).message)
            }
          }

          if (room.state === 'connected') onConnected()
          else room.once('connected', onConnected)
        })
        .catch((err) => {
          console.error('[Encryption] Admin failed:', err)
          setEncryptionError(err.message)
        })
    } else {
      // Joiner: set a temporary random passphrase BEFORE connecting.
      // This ensures all frames are encrypted from the start (admin sees black, not clear).
      // After key exchange, replace with the real passphrase from admin.
      const tempPassphrase = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(36).padStart(2, '0'))
        .join('')

      keyProvider
        .setKey(tempPassphrase)
        .then(() => {
          console.info('[Encryption] Joiner: temporary key set, allowing connection')
          setEncryptionSetupComplete(true)

          const exchange = async () => {
            if (keyExchangeDoneRef.current) return
            keyExchangeDoneRef.current = true

            try {
              await room.setE2EEEnabled(true)
              console.info('[Encryption] Joiner: E2EE enabled with temporary key')

              const kx = new InCallKeyExchange(room)
              keyExchangeRef.current = kx
              kx.startListening()

              console.info('[Encryption] Joiner: requesting real key from admin...')
              const keyBytes = await kx.requestKey()
              const passphrase = new TextDecoder().decode(keyBytes)
              console.info('[Encryption] Joiner: received real passphrase')

              await keyProvider.setKey(passphrase)
              setEncryptionKeyReady(true)
              console.info('[Encryption] Joiner: real key set, decryption active')
            } catch (err) {
              console.error('[Encryption] Joiner failed:', err)
              setEncryptionError((err as Error).message)
            }
          }

          if (room.state === 'connected') exchange()
          else room.once('connected', exchange)
        })
        .catch((err) => {
          console.error('[Encryption] Joiner temp key failed:', err)
          setEncryptionError(err.message)
        })
    }

    return () => {
      // Don't stop the admin's key distribution listener — it needs to persist
      if (keyExchangeRef.current && !isAdmin) {
        keyExchangeRef.current.stopListening()
        keyExchangeRef.current = null
      }
    }
  }, [room, encryptionEnabled, encryptionSetupComplete, isAdmin])

  // Track participants pending key exchange.
  // When a new participant joins an encrypted room, mark them as pending.
  // Clear when their encryption status becomes true.
  useEffect(() => {
    if (!encryptionEnabled) return

    const handleParticipantConnected = (participant: { identity: string }) => {
      setPendingParticipants((prev) => {
        const next = new Set(prev)
        next.add(participant.identity)
        return next
      })
    }

    const handleEncryptionStatusChanged = (_encrypted: boolean, participant?: { identity: string }) => {
      if (participant?.identity) {
        setPendingParticipants((prev) => {
          const next = new Set(prev)
          next.delete(participant.identity)
          return next
        })
      }
    }

    const handleTrackSubscribed = () => {
      // If any track is successfully subscribed, clear all pending
      setPendingParticipants(new Set())
    }

    room.on('participantConnected', handleParticipantConnected)
    room.on('participantEncryptionStatusChanged', handleEncryptionStatusChanged)
    room.on('trackSubscribed', handleTrackSubscribed)
    return () => {
      room.off('participantConnected', handleParticipantConnected)
      room.off('participantEncryptionStatusChanged', handleEncryptionStatusChanged)
      room.off('trackSubscribed', handleTrackSubscribed)
    }
  }, [room, encryptionEnabled])

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

  const isMobile = useIsMobile()

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
          connect={isConnectionWarmedUp && encryptionSetupComplete}
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
          onError={(e) => {
            posthog.captureException(e)
          }}
          onDisconnected={(e) => {
            switch (e) {
              case DisconnectReason.CLIENT_INITIATED:
                navigateTo('feedback')
                return
              case DisconnectReason.DUPLICATE_IDENTITY:
              case DisconnectReason.PARTICIPANT_REMOVED:
                navigateTo(
                  'feedback',
                  {},
                  {
                    state: { reason: e },
                  }
                )
                return
            }
          }}
          onMediaDeviceFailure={(e, kind) => {
            if (e == MediaDeviceFailure.DeviceInUse && !!kind) {
              setMediaDeviceError({ error: e, kind })
            }
          }}
        >
          <EncryptionProvider value={{ pendingParticipants }}>
            {encryptionEnabled && !isAdmin && (
              <EncryptionSetupOverlay
                isSettingUp={!encryptionKeyReady}
                error={encryptionError}
              />
            )}
            <VideoConference />
          </EncryptionProvider>
          {showInviteDialog && !isMobile && (
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

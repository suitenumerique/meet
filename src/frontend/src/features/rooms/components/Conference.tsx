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
import { setSymmetricKey, getSymmetricKey, getEncryptedVaultKey } from '@/features/encryption/lobbyKeyExchange'
import { isEncryptedRoom, ApiEncryptionMode } from '../api/ApiRoom'
import { VaultE2EEManager } from '@/features/encryption/VaultE2EEManager'
import { useVaultClient } from '@/features/encryption'
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

  const encryptionEnabled = isEncryptedRoom(data)
  const { client: vaultClient, hasKeys: vaultHasKeys } = useVaultClient()

  // Determine which E2EE backend to use:
  // - Advanced mode: VaultClient (iframe-based, key never leaves iframe)
  // - Basic mode: LiveKit's built-in Worker+KeyProvider with passphrase from URL hash
  const isAdvancedMode = data?.encryption_mode === ApiEncryptionMode.ADVANCED
  const useVaultE2EE = isAdvancedMode && !!vaultClient && !!vaultHasKeys

  // Refs for both approaches (only one is used per session)
  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const vaultManagerRef = useRef<VaultE2EEManager | null>(null)
  const [encryptionSetupComplete, setEncryptionSetupComplete] = useState(!encryptionEnabled)

  const getKeyProvider = () => {
    if (!keyProviderRef.current && encryptionEnabled && !useVaultE2EE) {
      keyProviderRef.current = new ExternalE2EEKeyProvider()
    }
    return keyProviderRef.current
  }

  const getWorker = () => {
    if (!workerRef.current && encryptionEnabled && !useVaultE2EE && typeof window !== 'undefined') {
      workerRef.current = new Worker(
        new URL('livekit-client/e2ee-worker', import.meta.url)
      )
    }
    return workerRef.current
  }

  const getVaultManager = () => {
    if (!vaultManagerRef.current && useVaultE2EE && vaultClient) {
      vaultManagerRef.current = new VaultE2EEManager(vaultClient)
    }
    return vaultManagerRef.current
  }

  const roomOptions = useMemo((): RoomOptions => {
    const baseOptions: RoomOptions = {
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
    }

    if (useVaultE2EE) {
      const vaultManager = getVaultManager()
      if (vaultManager) {
        baseOptions.encryption = { e2eeManager: vaultManager }
      }
    } else if (encryptionEnabled) {
      const worker = getWorker()
      const keyProvider = getKeyProvider()
      if (keyProvider && worker) {
        baseOptions.encryption = { keyProvider, worker }
      }
    }

    return baseOptions
    // do not rely on the userConfig object directly as its reference may change on every render
  }, [
    encryptionEnabled,
    useVaultE2EE,
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

  // Encryption key setup:
  // VaultE2EE: admin generates key via vaultClient.encryptWithoutKey(), joiner receives wrapped key
  // Fallback: admin generates passphrase, joiner receives via lobby DH exchange
  const isAdmin = mode === 'create' || data?.is_administrable === true
  const adminPassphraseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!encryptionEnabled || encryptionSetupComplete) return

    if (useVaultE2EE) {
      // VaultClient E2EE path — key never leaves the iframe
      const vaultManager = getVaultManager()
      if (!vaultManager || !vaultClient) return

      const setupVaultKey = async () => {
        try {
          if (isAdmin) {
            // Admin: generate a symmetric key via VaultClient
            const dummyData = new Uint8Array(32).buffer
            const { publicKey } = await vaultClient.getPublicKey()
            const { encryptedKeys } = await vaultClient.encryptWithoutKey(
              dummyData,
              { self: publicKey }
            )
            const encryptedSymmetricKey = encryptedKeys['self']
            vaultManager.setEncryptedSymmetricKey(encryptedSymmetricKey)
            console.info('[VaultE2EE] Admin: symmetric key generated')
          } else {
            // Joiner: use the vault-wrapped key received from admin via lobby
            const vaultKey = getEncryptedVaultKey()
            if (vaultKey) {
              vaultManager.setEncryptedSymmetricKey(vaultKey)
              console.info('[VaultE2EE] Joiner: vault key received from lobby')
            } else {
              console.error('[VaultE2EE] Joiner: no vault key available')
              return
            }
          }

          setEncryptionSetupComplete(true)

          const onConnected = async () => {
            try {
              await room.setE2EEEnabled(true)
              console.info('[VaultE2EE] E2EE enabled')
            } catch (err) {
              console.error('[VaultE2EE] E2EE enable failed:', err)
            }
          }

          if (room.state === 'connected') onConnected()
          else room.once('connected', onConnected)
        } catch (err) {
          console.error('[VaultE2EE] Setup failed:', err)
        }
      }

      setupVaultKey()
    } else {
      // Basic mode: LiveKit Worker+KeyProvider with passphrase in URL hash
      const keyProvider = getKeyProvider()
      if (!keyProvider) return

      let passphrase: string | null = null

      if (isAdmin) {
        // Admin: generate passphrase and put it in the URL hash
        if (!adminPassphraseRef.current) {
          // Check if there's already a hash (e.g. admin refreshed the page)
          const existingHash = window.location.hash.slice(1)
          if (existingHash) {
            adminPassphraseRef.current = existingHash
          } else {
            adminPassphraseRef.current = Array.from(crypto.getRandomValues(new Uint8Array(24)))
              .map((b) => b.toString(36).padStart(2, '0'))
              .join('')
            // Set the hash in the URL (without triggering navigation)
            window.history.replaceState(
              window.history.state,
              '',
              `${window.location.pathname}${window.location.search}#${adminPassphraseRef.current}`
            )
          }
        }
        passphrase = adminPassphraseRef.current
        setSymmetricKey(new TextEncoder().encode(passphrase))
      } else {
        // Joiner: read passphrase from URL hash (shared link) or from lobby exchange
        const hashKey = window.location.hash.slice(1)
        if (hashKey) {
          passphrase = hashKey
          setSymmetricKey(new TextEncoder().encode(passphrase))
        } else {
          // Fallback: key received via lobby DH exchange
          const preExchangedKey = getSymmetricKey()
          if (preExchangedKey) {
            passphrase = new TextDecoder().decode(preExchangedKey)
          }
        }
      }

      if (!passphrase) {
        console.error('[Encryption] No passphrase available (not in URL hash and no lobby exchange)')
        return
      }

      keyProvider
        .setKey(passphrase)
        .then(() => {
          setEncryptionSetupComplete(true)

          const onConnected = async () => {
            try {
              await room.setE2EEEnabled(true)
            } catch (err) {
              console.error('[Encryption] E2EE enable failed:', err)
            }
          }

          if (room.state === 'connected') onConnected()
          else room.once('connected', onConnected)
        })
        .catch((err) => {
          console.error('[Encryption] Key setup failed:', err)
        })
    }

  }, [room, encryptionEnabled, encryptionSetupComplete, isAdmin, useVaultE2EE])

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
          <VideoConference />
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

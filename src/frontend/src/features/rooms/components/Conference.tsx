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
import {
  generatePassphrase,
  getPassphraseFromHash,
  isValidPassphrase,
  EncryptionStatusProvider,
  EncryptionMismatchScreen,
  EncryptionPhase,
} from '@/features/encryption'
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

  // Trust the URL hash for the runtime "is encrypted" decision: it's the
  // only signal a hacked server can't fabricate. The DB flag tells us
  // whether the room creator *meant* this room to be encrypted — it's used
  // to detect mismatches (see below) but never to enable encryption alone.
  const hashPassphrase = getPassphraseFromHash()
  const dbSaysEncrypted = !!data?.is_encrypted
  const hasValidHash = isValidPassphrase(hashPassphrase)

  const encryptionMismatch:
    | 'missingPassphrase'
    | 'unexpectedPassphrase'
    | null =
    data === undefined
      ? null
      : dbSaysEncrypted && !hasValidHash
        ? 'missingPassphrase'
        : !dbSaysEncrypted && hashPassphrase.length > 0
          ? 'unexpectedPassphrase'
          : null

  const isEncrypted = dbSaysEncrypted && hasValidHash

  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const [encryptionSetupComplete, setEncryptionSetupComplete] = useState(
    !isEncrypted
  )

  const getKeyProvider = () => {
    if (!keyProviderRef.current && isEncrypted) {
      keyProviderRef.current = new ExternalE2EEKeyProvider()
    }
    return keyProviderRef.current
  }

  const getWorker = () => {
    if (!workerRef.current && isEncrypted && typeof window !== 'undefined') {
      workerRef.current = new Worker(
        new URL('livekit-client/e2ee-worker', import.meta.url)
      )
    }
    return workerRef.current
  }

  const roomOptions = useMemo((): RoomOptions => {
    const baseOptions: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoCodec: isEncrypted ? undefined : 'vp9',
        red: !isEncrypted,
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

    if (isEncrypted) {
      const worker = getWorker()
      const keyProvider = getKeyProvider()
      if (keyProvider && worker) {
        baseOptions.encryption = { keyProvider, worker }
      }
    }

    return baseOptions
    // do not rely on the userConfig object directly as its reference may change on every render
    // getKeyProvider/getWorker are stable refs, intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEncrypted,
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

  const isAdmin = mode === 'create' || data?.is_administrable === true
  const adminPassphraseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isEncrypted || encryptionSetupComplete) return

    const keyProvider = getKeyProvider()
    if (!keyProvider) return

    let passphrase: string | null = null

    if (isAdmin) {
      if (!adminPassphraseRef.current) {
        const existingHash = getPassphraseFromHash()
        if (existingHash) {
          adminPassphraseRef.current = existingHash
        } else {
          adminPassphraseRef.current = generatePassphrase()
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${window.location.search}#${adminPassphraseRef.current}`
          )
        }
      }
      passphrase = adminPassphraseRef.current
    } else {
      passphrase = getPassphraseFromHash() || null
    }

    if (!passphrase) {
      console.error('[Encryption] No passphrase available')
      return
    }

    keyProvider
      .setKey(passphrase)
      .then(async () => {
        // Enable E2EE BEFORE connecting — sets encryptionType=GCM so tracks
        // are published with encryption metadata from the start.
        try {
          await room.setE2EEEnabled(true)
        } catch (err) {
          console.error('[Encryption] E2EE enable failed:', err)
        }

        setEncryptionSetupComplete(true)
      })
      .catch((err) => {
        console.error('[Encryption] Key setup failed:', err)
      })
    // getKeyProvider is a stable ref; not part of deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isEncrypted, encryptionSetupComplete, isAdmin])

  // If the user changes the hash mid-session (e.g. corrects a typo), reload
  // so the new passphrase is picked up by the encryption setup.
  useEffect(() => {
    if (!isEncrypted) return
    const handleHashChange = () => {
      window.location.reload()
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [isEncrypted])

  useEffect(() => {
    /**
     * Warm up connection to LiveKit server before joining room
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
           * FIREFOX + PROXY WORKAROUND — see livekit-examples/meet/issues/466
           */
          const ws = new WebSocket(wssUrl)
          ws.onerror = () => ws.readyState <= 1 && ws.close()
        } catch (e) {
          console.debug('Firefox WebSocket workaround failed.', e)
        }
      }

      setIsConnectionWarmedUp(true)
    }
    prepareConnection()
  }, [room, apiConfig, isConnectionWarmedUp])

  const handlePhaseChange = (phase: EncryptionPhase) => {
    if (!isEncrypted) return
    if (phase === EncryptionPhase.PAUSED) {
      void room.setE2EEEnabled(false).catch((err) => {
        console.error('[Encryption] E2EE pause failed', err)
      })
    } else if (phase === EncryptionPhase.ENCRYPTED) {
      // Resume path: re-enable E2EE with the same URL passphrase that's
      // already loaded into the keyProvider.
      void room.setE2EEEnabled(true).catch((err) => {
        console.error('[Encryption] E2EE resume failed', err)
      })
    }
  }

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
    return (
      <ErrorScreen
        title={t('error.createRoom.heading')}
        body={t('error.createRoom.body')}
      />
    )
  }

  if (encryptionMismatch) {
    return <EncryptionMismatchScreen reason={encryptionMismatch} />
  }

  // Some clients (like DINUM) operate in bandwidth-constrained environments
  const connectOptions = {
    maxRetries: 5,
    peerConnectionTimeout: 60000,
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
          <EncryptionStatusProvider
            isEncrypted={isEncrypted}
            onPhaseChange={handlePhaseChange}
          >
            <VideoConference />
          </EncryptionStatusProvider>
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

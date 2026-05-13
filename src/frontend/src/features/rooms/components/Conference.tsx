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
  getPassphraseFromHash,
  isValidPassphrase,
  EncryptionMismatchScreen,
} from '@/features/encryption'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { Screen } from '@/layout/Screen'
import { QueryAware } from '@/components/QueryAware'
import { ErrorScreen } from '@/components/ErrorScreen'
import { fetchRoom } from '../api/fetchRoom'
import { ApiEncryptionMode, ApiRoom } from '../api/ApiRoom'
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

  // The URL hash is the *source of truth* for whether to encrypt: the
  // server is never given the passphrase, so a compromised server can't
  // fabricate or suppress encryption — it can only claim a status, and we
  // use that claim only as a sanity reference for the mismatch screen.
  //
  // `hasValidHash` is synchronous (reads window.location.hash), so it's
  // either true or false on every render — never "we don't know yet".
  const hashPassphrase = getPassphraseFromHash()
  const hasValidHash = isValidPassphrase(hashPassphrase)
  const dbSaysEncrypted = data?.encryption_mode === ApiEncryptionMode.BASIC

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

  // We treat the room as encrypted purely because we have a valid hash.
  // No server condition. If the hash is valid we MUST run E2EE; if not,
  // there's nothing to encrypt with.
  const isEncrypted = hasValidHash

  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null)
  const workerRef = useRef<Worker | null>(null)
  // `roomWithE2EE` is the actual `Room` instance for which we've already
  // run `setKey + setE2EEEnabled(true)`. Comparing it by reference with the
  // currently-memoised `room` lets us derive the "setup complete" status
  // synchronously during render — no separate boolean, no useEffect-driven
  // reset, no race window between a new Room appearing and a flag flipping.
  //
  // A device-pref change rebuilds `roomOptions` → a new `Room` instance is
  // memoised; on that same render `roomWithE2EE !== room` so the gate
  // below stays closed until the setup effect has stamped the new Room.
  const [roomWithE2EE, setRoomWithE2EE] = useState<Room | null>(null)
  const [encryptionSetupError, setEncryptionSetupError] =
    useState<Error | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEncrypted,
    userConfig.videoDeviceId,
    userConfig.videoPublishResolution,
    userConfig.audioDeviceId,
    userConfig.audioOutputDeviceId,
  ])

  const room = useMemo(() => new Room(roomOptions), [roomOptions])

  const encryptionSetupComplete = !isEncrypted || roomWithE2EE === room
  // Never let LiveKitRoom connect in an indeterminate state:
  //   1. `data` must have arrived from the server so we know whether to
  //      show the mismatch screen.
  //   2. If the URL has a valid hash, the *current* Room must have already
  //      been armed with setKey + setE2EEEnabled — otherwise the camera
  //      goes out in clear.
  const canConnectMediaWise = data !== undefined && encryptionSetupComplete

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

  useEffect(() => {
    if (!isEncrypted || roomWithE2EE === room) return

    const keyProvider = getKeyProvider()
    if (!keyProvider) return

    // `isEncrypted === hasValidHash`, so by the time we get here the URL
    // already carries a valid passphrase. Hash generation happens upstream
    // (in `Home.tsx` for new encrypted meetings); we just read it here.
    const passphrase = getPassphraseFromHash()
    if (!passphrase) return

    // Must only stamp the room as "armed" after the chain has actually
    // succeeded. If `setE2EEEnabled` rejects we surface the failure to
    // the user via `encryptionSetupError` and stay disconnected.
    let cancelled = false
    keyProvider
      .setKey(passphrase)
      .then(() => room.setE2EEEnabled(true))
      .then(() => {
        if (!cancelled) setRoomWithE2EE(room)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[Encryption] setup failed:', err)
        setEncryptionSetupError(
          err instanceof Error ? err : new Error(String(err))
        )
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isEncrypted, roomWithE2EE])

  useEffect(() => {
    if (!isEncrypted) return
    let currentHash = getPassphraseFromHash()
    const onHashChange = () => {
      const next = getPassphraseFromHash()
      if (next === currentHash) return
      currentHash = next
      window.location.reload()
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
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

  if (encryptionSetupError) {
    return (
      <ErrorScreen
        title={t('error.encryptionSetup.heading')}
        body={t('error.encryptionSetup.body')}
      />
    )
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
          connect={isConnectionWarmedUp && canConnectMediaWise}
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

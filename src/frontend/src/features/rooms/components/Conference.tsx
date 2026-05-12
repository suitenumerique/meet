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
  RoomEvent,
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
import { usePatchRoom } from '../api/patchRoom'
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
  // encryption_paused is an admin override on an encrypted room: when set,
  // E2EE is suspended for this call so external devices can join, but the
  // link still carries the hash and the room can be resumed at any time.
  //
  // Two derived flags:
  //   encryptionCapable — this room has an encryption key; the Room object
  //     is constructed with the e2ee worker + key provider regardless of
  //     whether E2EE is currently active. Stable across mid-call pauses, so
  //     the Room instance never gets recreated mid-call.
  //   liveEncryption — encryption is currently active (capable AND not
  //     paused). Drives room.setE2EEEnabled() and the encryption phase UI.
  const hashPassphrase = getPassphraseFromHash()
  const dbSaysEncrypted = !!data?.is_encrypted
  const isPaused = !!data?.encryption_paused
  const hasValidHash = isValidPassphrase(hashPassphrase)

  const encryptionMismatch:
    | 'missingPassphrase'
    | 'unexpectedPassphrase'
    | null =
    data === undefined
      ? null
      : dbSaysEncrypted && !isPaused && !hasValidHash
        ? 'missingPassphrase'
        : !dbSaysEncrypted && hashPassphrase.length > 0
          ? 'unexpectedPassphrase'
          : null

  const encryptionCapable = dbSaysEncrypted && hasValidHash
  const liveEncryption = encryptionCapable && !isPaused
  // Kept as `isEncrypted` so legacy reads below stay readable. Refers to
  // the live state — flip-on-pause/flip-on-resume is wired below.
  const isEncrypted = liveEncryption

  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null)
  const workerRef = useRef<Worker | null>(null)
  // Setup is complete once the key provider is wired up; it does NOT need
  // to re-run when encryption_paused flips. We toggle the active state of
  // E2EE separately via room.setE2EEEnabled.
  const [encryptionSetupComplete, setEncryptionSetupComplete] = useState(
    !encryptionCapable
  )

  const getKeyProvider = () => {
    if (!keyProviderRef.current && encryptionCapable) {
      keyProviderRef.current = new ExternalE2EEKeyProvider()
    }
    return keyProviderRef.current
  }

  const getWorker = () => {
    if (
      !workerRef.current &&
      encryptionCapable &&
      typeof window !== 'undefined'
    ) {
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
        // VP8 whenever the room is encryption-capable: encryption_paused
        // can flip mid-call to let a SIP/phone caller bridge, and the
        // gateway's room→SIP GStreamer path only handles VP8 today. Using
        // VP8 unconditionally for encryption-capable rooms keeps the Room
        // instance stable across pause/resume.
        videoCodec: encryptionCapable ? 'vp8' : 'vp8',
        red: !encryptionCapable,
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

    // Always wire up the E2EE worker + key provider for an encryption-
    // capable room. We toggle whether encryption is *active* with
    // room.setE2EEEnabled below; the worker stays around so resume is a
    // single API call rather than a Room reconstruction.
    if (encryptionCapable) {
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
    encryptionCapable,
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
    if (!encryptionCapable || encryptionSetupComplete) return

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
        // are published with encryption metadata from the start. If the
        // room is currently paused, we set up the worker but leave E2EE
        // disabled (resume flips it on without rebuilding the Room).
        try {
          await room.setE2EEEnabled(liveEncryption)
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
  }, [room, encryptionCapable, encryptionSetupComplete, isAdmin])

  // Mid-call admin toggle: when the server flips encryption_paused, every
  // browser client sees the change as `liveEncryption` flipping. A single
  // setE2EEEnabled call is enough — livekit-client internally calls
  // republishAllTracks so the SFU forwards tracks in the new mode (plain
  // during pause so SIP can bridge; E2EE on resume).
  //
  // republishAllTracks occasionally drops a track silently when its
  // renegotiation hits a transport-state race. We snapshot the local
  // mic/camera enabled state before the toggle and re-assert them
  // afterwards so the user doesn't lose their camera or microphone over a
  // pause/resume cycle.
  const prevLiveRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (!encryptionCapable || !encryptionSetupComplete) return
    if (prevLiveRef.current === null) {
      prevLiveRef.current = liveEncryption
      return // initial setup already covered this value
    }
    if (prevLiveRef.current === liveEncryption) return
    prevLiveRef.current = liveEncryption
    void (async () => {
      const lp = room.localParticipant
      const camWasOn = lp.isCameraEnabled
      const micWasOn = lp.isMicrophoneEnabled
      try {
        await room.setE2EEEnabled(liveEncryption)
      } catch (err) {
        console.error('[Encryption] mid-call E2EE toggle failed', err)
        return
      }
      // Re-assert track state — republishAllTracks may have silently
      // dropped one of them mid-renegotiation.
      try {
        if (camWasOn && !lp.isCameraEnabled) {
          await lp.setCameraEnabled(true)
        }
        if (micWasOn && !lp.isMicrophoneEnabled) {
          await lp.setMicrophoneEnabled(true)
        }
      } catch (err) {
        console.error('[Encryption] track re-assert failed', err)
      }
    })()
  }, [room, encryptionCapable, encryptionSetupComplete, liveEncryption])

  // Listen for server-driven metadata updates (admin pausing/resuming from
  // a different client) and refresh the room query so liveEncryption above
  // reflects the new state.
  useEffect(() => {
    if (!room) return
    const onMetadataChanged = () => {
      queryClient.invalidateQueries({ queryKey: fetchKey })
    }
    room.on(RoomEvent.RoomMetadataChanged, onMetadataChanged)
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, onMetadataChanged)
    }
    // fetchKey is derived from roomId; both stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  // If the user changes the hash mid-session (e.g. corrects a typo), reload
  // so the new passphrase is picked up by the encryption setup.
  useEffect(() => {
    if (!encryptionCapable) return
    const handleHashChange = () => {
      window.location.reload()
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [encryptionCapable])

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

  const { mutateAsync: patchRoom } = usePatchRoom()
  const setServerEncryptionPaused = async (paused: boolean) => {
    await patchRoom({ roomId, room: { encryption_paused: paused } })
  }

  const handlePhaseChange = (phase: EncryptionPhase) => {
    if (!encryptionCapable) return
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
            setServerEncryptionPaused={setServerEncryptionPaused}
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

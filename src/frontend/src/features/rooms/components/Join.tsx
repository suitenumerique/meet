import { useTranslation } from 'react-i18next'
import { usePreviewTracks } from '@livekit/components-react'
import { css } from '@/styled-system/css'
import { Screen } from '@/layout/Screen'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createLocalVideoTrack,
  createLocalAudioTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  Track,
} from 'livekit-client'
import { H } from '@/primitives/H'
import { Field } from '@/primitives/Field'
import { Button, Dialog, Text, Form } from '@/primitives'
import { VStack } from '@/styled-system/jsx'
import { Heading } from 'react-aria-components'
import { RiImageCircleAiFill } from '@remixicon/react'
import {
  EffectsConfiguration,
  EffectsConfigurationProps,
} from '../livekit/components/effects/EffectsConfiguration'
import { SelectDevice } from '../livekit/components/controls/Device/SelectDevice'
import { usePersistentUserChoices } from '../livekit/hooks/usePersistentUserChoices'
import { BackgroundProcessorFactory } from '../livekit/components/blur'
import { isMobileBrowser } from '@livekit/components-core'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { keys } from '@/api/queryKeys'
import { useLobby } from '../hooks/useLobby'
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '@/api/queryClient'
import { ApiLobbyStatus, ApiRequestEntry } from '../api/requestEntry'
import { Spinner } from '@/primitives/Spinner'
import { ApiAccessLevel } from '../api/ApiRoom'
import { useLoginHint } from '@/hooks/useLoginHint'
import { openPermissionsDialog } from '@/stores/permissions'
import { ToggleDevice } from './join/ToggleDevice'
import { useResolveInitiallyDefaultDeviceId } from '../livekit/hooks/useResolveInitiallyDefaultDeviceId'
import { isSafari } from '@/utils/livekit'
import type { LocalUserChoices } from '@/stores/userChoices'
import { useCannotUseDevice } from '../livekit/hooks/useCannotUseDevice'

const onError = (e: Error) => console.error('ERROR', e)

const Effects = ({
  videoTrack,
  onSubmit,
}: Pick<EffectsConfigurationProps, 'videoTrack' | 'onSubmit'>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join.effects' })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const openDialog = () => setIsDialogOpen(true)

  if (!BackgroundProcessorFactory.isSupported() || isMobileBrowser()) {
    return
  }

  return (
    <>
      <Dialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        role="dialog"
        type="flex"
        size="large"
      >
        <Heading
          slot="title"
          level={1}
          className={css({
            textStyle: 'h1',
            marginBottom: '0.25rem',
          })}
        >
          {t('title')}
        </Heading>
        <Text
          variant="subTitle"
          className={css({
            marginBottom: '1.5rem',
          })}
        >
          {t('subTitle')}
        </Text>
        <EffectsConfiguration videoTrack={videoTrack} onSubmit={onSubmit} />
      </Dialog>
      <Button
        variant="whiteCircle"
        onPress={openDialog}
        tooltip={t('description')}
        aria-label={t('description')}
      >
        <RiImageCircleAiFill size={24} />
      </Button>
    </>
  )
}

export const Join = ({
  enterRoom,
  roomId,
}: {
  enterRoom: () => void
  roomId: string
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const {
    userChoices: {
      audioEnabled,
      videoEnabled,
      audioDeviceId,
      audioOutputDeviceId,
      videoDeviceId,
      processorSerialized,
      username,
    },
    saveAudioInputEnabled,
    saveAudioOutputDeviceId,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
    saveUsername,
    saveProcessorSerialized,
  } = usePersistentUserChoices()

  const initialUserChoices = useRef<LocalUserChoices | null>(null)

  if (initialUserChoices.current === null) {
    initialUserChoices.current = {
      audioEnabled,
      videoEnabled,
      audioDeviceId,
      audioOutputDeviceId,
      videoDeviceId,
      processorSerialized,
      username,
    }
  }

  const tracks = usePreviewTracks(
    {
      audio: !!initialUserChoices.current &&
        initialUserChoices.current?.audioEnabled && {
          deviceId: initialUserChoices.current.audioDeviceId,
        },
      video: !!initialUserChoices.current &&
        initialUserChoices.current?.videoEnabled && {
          deviceId: initialUserChoices.current.videoDeviceId,
          processor:
            BackgroundProcessorFactory.deserializeProcessor(
              processorSerialized
            ),
        },
    },
    onError
  )

  const [dynamicVideoTrack, setDynamicVideoTrack] =
    useState<LocalVideoTrack | null>(null)
  const [dynamicAudioTrack, setDynamicAudioTrack] =
    useState<LocalAudioTrack | null>(null)

  const previewVideoTrack = useMemo(
    () =>
      tracks?.filter(
        (track) => track.kind === Track.Kind.Video
      )[0] as LocalVideoTrack,
    [tracks]
  )

  const previewAudioTrack = useMemo(
    () =>
      tracks?.filter(
        (track) => track.kind === Track.Kind.Audio
      )[0] as LocalAudioTrack,
    [tracks]
  )

  /*
   * Dynamic track creation strategy: Only create a dynamic track if the user initially disabled audio/video
   * but now wants to enable it. This is a "just-in-time" acquisition pattern where we create the track
   * on-demand. We avoid creating tracks when the user explicitly requested them to be disabled.
   */
  useEffect(() => {
    const createVideoTrack = async () => {
      try {
        const track = await createLocalVideoTrack({
          deviceId: { exact: videoDeviceId },
          processor:
            BackgroundProcessorFactory.deserializeProcessor(
              processorSerialized
            ),
        })
        setDynamicVideoTrack(track)
      } catch (error) {
        onError(error as Error)
      }
    }

    if (
      videoEnabled &&
      !initialUserChoices.current?.videoEnabled &&
      !previewVideoTrack &&
      !dynamicVideoTrack
    ) {
      createVideoTrack()
    }
  }, [
    videoEnabled,
    videoDeviceId,
    processorSerialized,
    previewVideoTrack,
    dynamicVideoTrack,
  ])

  useEffect(() => {
    const createAudioTrack = async () => {
      try {
        const track = await createLocalAudioTrack({
          deviceId: { exact: audioDeviceId },
        })
        setDynamicAudioTrack(track)
      } catch (error) {
        onError(error as Error)
      }
    }
    if (
      audioEnabled &&
      !initialUserChoices.current?.audioEnabled &&
      !dynamicAudioTrack &&
      !dynamicAudioTrack
    ) {
      createAudioTrack()
    }
  }, [audioEnabled, audioDeviceId, previewAudioTrack, dynamicAudioTrack])

  // Cleanup dynamic tracks
  useEffect(() => {
    return () => {
      dynamicVideoTrack?.stop()
    }
  }, [dynamicVideoTrack])
  useEffect(() => {
    return () => {
      dynamicAudioTrack?.stop()
    }
  }, [dynamicAudioTrack])

  // Final tracks (dynamic takes precedence over preview)
  const videoTrack = dynamicVideoTrack || previewVideoTrack
  const audioTrack = dynamicAudioTrack || previewAudioTrack

  // LiveKit by default populates device choices with "default" value.
  // Instead, use the current device id used by the preview track as a default
  useResolveInitiallyDefaultDeviceId(
    audioDeviceId,
    audioTrack,
    saveAudioInputDeviceId
  )
  useResolveInitiallyDefaultDeviceId(
    videoDeviceId,
    videoTrack,
    saveVideoInputDeviceId
  )

  const videoEl = useRef(null)
  const isVideoInitiated = useRef(false)

  useEffect(() => {
    const videoElement = videoEl.current as HTMLVideoElement | null

    const handleVideoLoaded = () => {
      if (videoElement) {
        isVideoInitiated.current = true
        videoElement.style.opacity = '1'
      }
    }

    if (videoElement && videoTrack && videoEnabled) {
      // videoTrack.unmute()
      videoTrack.attach(videoElement)
      videoElement.addEventListener('loadedmetadata', handleVideoLoaded)
    }

    return () => {
      videoTrack?.detach()
      if (videoElement) {
        videoElement.removeEventListener('loadedmetadata', handleVideoLoaded)
        videoElement.style.opacity = '0'
      }
      isVideoInitiated.current = false
    }
  }, [videoTrack, videoEnabled])

  // Room data strategy:
  // 1. Initial fetch is performed to check access and get LiveKit configuration
  // 2. Data remains valid for 6 hours to avoid unnecessary refetches
  // 3. State is manually updated via queryClient when a waiting participant is accepted
  // 4. No automatic refetching or revalidation occurs during this period
  // todo - refactor in a hook
  const {
    data: roomData,
    error,
    isError,
    refetch: refetchRoom,
  } = useQuery({
    /* eslint-disable @tanstack/query/exhaustive-deps */
    queryKey: [keys.room, roomId],
    queryFn: () => fetchRoom({ roomId, username }),
    staleTime: 6 * 60 * 60 * 1000, // By default, LiveKit access tokens expire 6 hours after generation
    retry: false,
    enabled: false,
  })

  useEffect(() => {
    if (isError && error?.statusCode == 404) {
      // The room component will handle the room creation if the user is authenticated
      enterRoom()
    }
  }, [isError, error, enterRoom])

  const handleAccepted = (response: ApiRequestEntry) => {
    queryClient.setQueryData([keys.room, roomId], {
      ...roomData,
      livekit: response.livekit,
    })
    enterRoom()
  }

  const { status, startWaiting } = useLobby({
    roomId,
    username,
    onAccepted: handleAccepted,
  })

  const { openLoginHint } = useLoginHint()

  const handleSubmit = async () => {
    const { data } = await refetchRoom()

    if (!data?.livekit) {
      // Display a message to inform the user that by logging in, they won't have to wait for room entry approval.
      if (data?.access_level == ApiAccessLevel.TRUSTED) {
        openLoginHint()
      }
      startWaiting()
      return
    }

    enterRoom()
  }

  const isCameraDeniedOrPrompted = useCannotUseDevice('videoinput')
  const isMicrophoneDeniedOrPrompted = useCannotUseDevice('audioinput')

  const hintMessage = useMemo(() => {
    if (isCameraDeniedOrPrompted) {
      return isMicrophoneDeniedOrPrompted
        ? 'cameraAndMicNotGranted'
        : 'cameraNotGranted'
    }
    if (!videoEnabled) {
      return 'cameraDisabled'
    }
    if (!isVideoInitiated.current) {
      return 'cameraStarting'
    }
    if (videoTrack && videoEnabled) {
      return ''
    }
  }, [
    videoTrack,
    videoEnabled,
    isCameraDeniedOrPrompted,
    isMicrophoneDeniedOrPrompted,
  ])

  const permissionsButtonLabel = useMemo(() => {
    if (!isMicrophoneDeniedOrPrompted && !isCameraDeniedOrPrompted) {
      return null
    }
    if (isCameraDeniedOrPrompted && isMicrophoneDeniedOrPrompted) {
      return 'cameraAndMicNotGranted'
    }
    if (isCameraDeniedOrPrompted && !isMicrophoneDeniedOrPrompted) {
      return 'cameraNotGranted'
    }
    return null
  }, [isMicrophoneDeniedOrPrompted, isCameraDeniedOrPrompted])

  const renderWaitingState = () => {
    switch (status) {
      case ApiLobbyStatus.TIMEOUT:
        return (
          <VStack alignItems="center" textAlign="center">
            <H lvl={1} margin={false} centered>
              {t('timeoutInvite.title')}
            </H>
            <Text as="p" variant="note">
              {t('timeoutInvite.body')}
            </Text>
          </VStack>
        )

      case ApiLobbyStatus.DENIED:
        return (
          <VStack alignItems="center" textAlign="center">
            <H lvl={1} margin={false} centered>
              {t('denied.title')}
            </H>
            <Text as="p" variant="note">
              {t('denied.body')}
            </Text>
          </VStack>
        )

      case ApiLobbyStatus.WAITING:
        return (
          <VStack alignItems="center" textAlign="center">
            <H lvl={1} margin={false} centered>
              {t('waiting.title')}
            </H>
            <Text
              as="p"
              variant="note"
              className={css({ marginBottom: '1.5rem' })}
            >
              {t('waiting.body')}
            </Text>
            <Spinner />
          </VStack>
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
              <Field
                type="text"
                onChange={saveUsername}
                label={t('usernameLabel')}
                aria-label={t('usernameLabel')}
                defaultValue={username}
                validate={(value) => !value && t('errors.usernameEmpty')}
                wrapperProps={{
                  noMargin: true,
                  fullWidth: true,
                }}
                labelProps={{
                  center: true,
                }}
                maxLength={50}
              />
            </VStack>
          </Form>
        )
    }
  }

  return (
    <Screen footer={false}>
      <div
        className={css({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          flexDirection: 'column',
          flexGrow: 1,
          gap: { base: '1rem', sm: '2rem', lg: 0 },
          lg: {
            flexDirection: 'row',
          },
        })}
      >
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minWidth: 0,
            maxWidth: '764px',
            lg: {
              height: '540px',
              flexGrow: 1,
            },
          })}
        >
          <div
            className={css({
              display: 'inline-flex',
              flexDirection: 'column',
              flexGrow: 1,
              minWidth: 0,
              flexShrink: { base: 0, sm: 1 },
            })}
          >
            <div
              className={css({
                borderRadius: '1rem',
                flex: '0 1',
                minWidth: '320px',
                margin: {
                  base: '0.5rem',
                  sm: '1rem',
                  lg: '1rem 0.5rem 1rem 1rem',
                },
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              })}
            >
              <div
                className={css({
                  position: 'absolute',
                  top: 0,
                  height: '5rem',
                  width: '100%',
                  backgroundImage:
                    'linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 40%, rgba(0, 0, 0, 0.1) 80%, rgba(0, 0, 0, 0) 100%)',
                  zIndex: 1,
                })}
              />
              <div
                className={css({
                  position: 'absolute',
                  bottom: 0,
                  height: '5rem',
                  width: '100%',
                  backgroundImage:
                    'linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 35%, rgba(0, 0, 0, 0.1) 75%, rgba(0, 0, 0, 0) 100%)',
                  zIndex: 1,
                })}
              />
              <div
                className={css({
                  position: 'relative',
                  width: '100%',
                  height: 'fit-content',
                  aspectRatio: '16 / 9',
                })}
              >
                <div
                  className={css({
                    backgroundColor: 'black',
                    position: 'absolute',
                    boxSizing: 'border-box',
                    top: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                  })}
                >
                  <div
                    aria-label={t(
                      `videoPreview.${videoEnabled ? 'enabled' : 'disabled'}`
                    )}
                    role="status"
                    className={css({
                      position: 'absolute',
                      top: 0,
                      width: '100%',
                    })}
                  >
                    <div
                      className={css({
                        width: '100%',
                        height: 'auto',
                        aspectRatio: '16 / 9',
                        overflow: 'hidden',
                        position: 'absolute',
                        top: '-2px',
                        left: '-2px',
                        pointerEvents: 'none',
                        transform: 'scale(1.02)',
                      })}
                    >
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        ref={videoEl}
                        width="1280"
                        height="720"
                        style={{
                          display:
                            !videoEnabled || isCameraDeniedOrPrompted
                              ? 'none'
                              : undefined,
                        }}
                        className={css({
                          position: 'absolute',
                          transform: 'rotateY(180deg)',
                          opacity: 0,
                          height: '100%',
                          transition: 'opacity 0.3s ease-in-out',
                          objectFit: 'cover',
                        })}
                        disablePictureInPicture
                        disableRemotePlayback
                      />
                    </div>
                  </div>
                  <div
                    role="alert"
                    className={css({
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      width: '100%',
                      justifyContent: 'center',
                      textAlign: 'center',
                      alignItems: 'center',
                      padding: '0.24rem',
                      boxSizing: 'border-box',
                      gap: '1rem',
                    })}
                  >
                    <p
                      className={css({
                        fontWeight: '400',
                        fontSize: { base: '1rem', sm: '1.25rem', lg: '1.5rem' },
                        textWrap: 'balance',
                        color: 'white',
                      })}
                    >
                      {hintMessage && t(hintMessage)}
                    </p>
                    {isCameraDeniedOrPrompted && (
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={openPermissionsDialog}
                      >
                        {t(`permissionsButton.${permissionsButtonLabel}`)}
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className={css({
                    position: 'absolute',
                    bottom: '1rem',
                    zIndex: '1',
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'center',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  })}
                >
                  <ToggleDevice
                    source={Track.Source.Microphone}
                    initialState={audioEnabled}
                    track={audioTrack}
                    onChange={(enabled) => saveAudioInputEnabled(enabled)}
                    onDeviceError={(error) => console.error(error)}
                  />
                  <ToggleDevice
                    source={Track.Source.Camera}
                    initialState={videoEnabled}
                    track={videoTrack}
                    onChange={(enabled) => saveVideoInputEnabled(enabled)}
                    onDeviceError={(error) => console.error(error)}
                  />
                </div>
                <div
                  className={css({
                    position: 'absolute',
                    right: '1rem',
                    bottom: '1rem',
                    zIndex: '1',
                  })}
                >
                  <Effects
                    videoTrack={videoTrack}
                    onSubmit={(processor) =>
                      saveProcessorSerialized(processor?.serialize())
                    }
                  />
                </div>
              </div>
            </div>
            <div
              className={css({
                display: 'flex',
                justifyContent: 'center',
                gap: '2%',
                width: '80%',
                marginX: 'auto',
              })}
            >
              <div
                className={css({
                  width: '30%',
                })}
              >
                <SelectDevice
                  kind="audioinput"
                  id={audioDeviceId}
                  onSubmit={async (id) => {
                    try {
                      saveAudioInputDeviceId(id)
                      if (audioTrack) {
                        await audioTrack.setDeviceId({ exact: id })
                      }
                    } catch (err) {
                      console.error('Failed to switch microphone device', err)
                    }
                  }}
                />
              </div>
              {!isSafari() && (
                <div
                  className={css({
                    width: '30%',
                  })}
                >
                  <SelectDevice
                    kind="audiooutput"
                    id={audioOutputDeviceId}
                    onSubmit={saveAudioOutputDeviceId}
                  />
                </div>
              )}
              <div
                className={css({
                  width: '30%',
                })}
              >
                <SelectDevice
                  kind="videoinput"
                  id={videoDeviceId}
                  onSubmit={async (id) => {
                    try {
                      saveVideoInputDeviceId(id)
                      if (videoTrack) {
                        await await videoTrack.setDeviceId({ exact: id })
                      }
                    } catch (err) {
                      console.error('Failed to switch camera device', err)
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: '0 0 448px',
            position: 'relative',
            margin: '1rem 1rem 1rem 0.5rem',
          })}
        >
          {renderWaitingState()}
        </div>
      </div>
    </Screen>
  )
}

import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Screen } from '@/layout/Screen'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Track } from 'livekit-client'
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
import { ToggleDeviceJoin } from '@/features/rooms/components/ToggleDeviceJoin'
import { SelectDeviceJoin } from '@/features/rooms/components/SelectDeviceJoin'
import { usePreviewTracks } from '@/features/rooms/hooks/usePreviewTracks'
import { usePermissions } from '@/features/rooms/hooks/usePermissions'

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
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveAudioOutputDeviceId,
    saveVideoInputDeviceId,
    saveUsername,
    saveProcessorSerialized,
  } = usePersistentUserChoices()

  // fix - permission issue, when permission not set doesn't refresh
  const { videoTrack, audioTrack } = usePreviewTracks(
    {
      audio: { deviceId: audioDeviceId },
      video: {
        deviceId: videoDeviceId,
        processor:
          BackgroundProcessorFactory.deserializeProcessor(processorSerialized),
      },
    },
    onError
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
      videoTrack.unmute()
      videoTrack.attach(videoElement)
      videoElement.addEventListener('loadedmetadata', handleVideoLoaded)
    }

    return () => {
      videoTrack?.detach()
      videoElement?.removeEventListener('loadedmetadata', handleVideoLoaded)
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

  const { isCameraGranted, isMicrophoneGranted } = usePermissions()

  const hintMessage = useMemo(() => {
    if (!isCameraGranted) {
      if (!isMicrophoneGranted) {
        return 'cameraAndMicNotGranted'
      }
      return 'cameraNotGranted'
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
  }, [videoTrack, videoEnabled, isCameraGranted, isMicrophoneGranted])

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
            className={css({
              width: '100%',
              maxWidth: '340px',
            })}
          >
            <VStack marginBottom={1}>
              <H lvl={1} margin="sm" centered>
                {t('heading')}
              </H>
              <Field
                type="text"
                onChange={saveUsername}
                label={t('usernameLabel')}
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
                      `videoPreview.${videoEnabled && isCameraGranted ? 'enabled' : 'disabled'}`
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
                            !videoEnabled || !isCameraGranted
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
                  </div>
                </div>
                <div
                  className={css({
                    position: 'absolute',
                    right: '50%',
                    bottom: '1rem',
                    zIndex: '1',
                    display: 'flex',
                    gap: '1.5rem',
                    justifyContent: 'center',
                    marginRight: '-68px',
                  })}
                >
                  <ToggleDeviceJoin
                    source={Track.Source.Microphone}
                    initialState={audioEnabled}
                    track={audioTrack}
                    onChange={saveAudioInputEnabled}
                  />
                  <ToggleDeviceJoin
                    source={Track.Source.Camera}
                    initialState={videoEnabled}
                    track={videoTrack}
                    onChange={(value) => {
                      const videoElement =
                        videoEl.current as HTMLVideoElement | null

                      if (isVideoInitiated.current && !value && videoElement) {
                        isVideoInitiated.current = false
                        videoElement.style.opacity = '0'
                      }

                      saveVideoInputEnabled(value)
                    }}
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
                display: 'none',
                sm: {
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '2%',
                  width: '80%',
                  marginX: 'auto',
                },
              })}
            >
              <div
                className={css({
                  width: '30%',
                })}
              >
                <SelectDeviceJoin
                  kind="audioinput"
                  id={audioDeviceId}
                  onSubmit={saveAudioInputDeviceId}
                />
              </div>
              <div
                className={css({
                  width: '30%',
                })}
              >
                <SelectDeviceJoin
                  kind="audiooutput"
                  id={audioOutputDeviceId}
                  onSubmit={saveAudioOutputDeviceId}
                />
              </div>
              <div
                className={css({
                  width: '30%',
                })}
              >
                <SelectDeviceJoin
                  kind="videoinput"
                  id={videoDeviceId}
                  onSubmit={saveVideoInputDeviceId}
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

import { useTranslation } from 'react-i18next'
import { usePreviewTracks } from '@livekit/components-react'
import { css } from '@/styled-system/css'
import { Screen } from '@/layout/Screen'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  MediaDeviceFailure,
  Track,
} from 'livekit-client'
import { Button, Dialog, Text } from '@/primitives'
import { Heading } from 'react-aria-components'
import { RiImageCircleAiFill } from '@remixicon/react'
import {
  EffectsConfiguration,
  EffectsConfigurationProps,
} from '../livekit/components/effects/EffectsConfiguration'
import { SelectDevice } from '../livekit/components/controls/Device/SelectDevice'
import { Lobby } from './Lobby'
import { ToggleDevice } from '../livekit/components/controls/Device/ToggleDevice'
import { BackgroundProcessorFactory } from '../livekit/components/blur'
import { isMobileBrowser } from '@livekit/components-core'
import {
  notePermissionDeniedFromGum,
  openPermissionsDialog,
  PermissionKind,
} from '@/stores/permissions'
import { isSafari } from '@/utils/livekit'
import { reportError } from '@/features/analytics/telemetry'

import {
  type LocalUserChoices,
  saveAudioInputDeviceId,
  saveAudioInputEnabled,
  saveAudioOutputDeviceId,
  saveVideoInputDeviceId,
  saveVideoInputEnabled,
  userChoicesStore,
} from '@/stores/userChoices'

import { useCannotUseDevice } from '../livekit/hooks/useCannotUseDevice'
import { useSyncTrackDeviceId } from '../livekit/hooks/useSyncTrackDeviceId'
import { useSnapshot } from 'valtio'

const onError = (e: Error, kind?: PermissionKind) => {
  reportError('join_preview_failure', e, { path: 'join_preview' })
  if (
    MediaDeviceFailure.getFailure(e) === MediaDeviceFailure.PermissionDenied
  ) {
    notePermissionDeniedFromGum(kind)
  }
}

const Effects = ({
  videoTrack,
}: Pick<EffectsConfigurationProps, 'videoTrack'>) => {
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
        <EffectsConfiguration videoTrack={videoTrack} />
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
    audioEnabled,
    videoEnabled,
    audioDeviceId,
    audioOutputDeviceId,
    videoDeviceId,
    processorConfig,
  } = useSnapshot(userChoicesStore)

  const initialUserChoices = useRef<LocalUserChoices | null>(null)

  if (initialUserChoices.current === null) {
    initialUserChoices.current = {
      audioEnabled,
      videoEnabled,
      audioDeviceId,
      audioOutputDeviceId,
      videoDeviceId,
      processorConfig,
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
          processor: BackgroundProcessorFactory.fromProcessorConfig(
            initialUserChoices.current.processorConfig
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
          deviceId: videoDeviceId,
          processor:
            BackgroundProcessorFactory.fromProcessorConfig(processorConfig),
        })
        setDynamicVideoTrack(track)
      } catch (error) {
        onError(error as Error, 'camera')
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
    processorConfig,
    previewVideoTrack,
    dynamicVideoTrack,
  ])

  useEffect(() => {
    const createAudioTrack = async () => {
      try {
        const track = await createLocalAudioTrack({
          deviceId: audioDeviceId,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          voiceIsolation: false,
          // Audio quality optimized for voice
          sampleRate: 48000, // High quality sample rate
          channelCount: 1, // Mono for voice calls (saves bandwidth)
          sampleSize: 16, // 16-bit audio
        })
        setDynamicAudioTrack(track)
      } catch (error) {
        onError(error as Error, 'microphone')
      }
    }
    if (
      audioEnabled &&
      !initialUserChoices.current?.audioEnabled &&
      !previewAudioTrack &&
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

  useSyncTrackDeviceId(audioTrack, saveAudioInputDeviceId)
  useSyncTrackDeviceId(videoTrack, saveVideoInputDeviceId)

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
          gap: { base: '1rem', sm: '2rem', lg: '2rem' },
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
                      {/* eslint-disable jsx-a11y/media-has-caption */}
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
                        onPress={() => openPermissionsDialog('videoinput')}
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
                    kind="audioinput"
                    context="join"
                    enabled={audioEnabled}
                    toggle={async () => {
                      saveAudioInputEnabled(!audioEnabled)
                      if (audioEnabled) {
                        await audioTrack?.mute()
                      } else {
                        await audioTrack?.unmute()
                      }
                    }}
                  />
                  <ToggleDevice
                    kind="videoinput"
                    context="join"
                    enabled={videoEnabled}
                    toggle={async () => {
                      saveVideoInputEnabled(!videoEnabled)
                      if (videoEnabled) {
                        await videoTrack?.mute()
                      } else {
                        await videoTrack?.unmute()
                      }
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
                  <Effects videoTrack={videoTrack} />
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
                  track={audioTrack}
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
                        await videoTrack.setDeviceId({ exact: id })
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
            flex: '0 0 360px',
            position: 'relative',
            margin: '1rem 1rem 1rem 0.5rem',
          })}
        >
          <Lobby roomId={roomId} enterRoom={enterRoom} />
        </div>
      </div>
    </Screen>
  )
}

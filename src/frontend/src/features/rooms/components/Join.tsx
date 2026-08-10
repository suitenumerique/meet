import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { Screen } from '@/layout/Screen'
import { type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client'
import { Button, Dialog, Text } from '@/primitives'
import { Heading } from 'react-aria-components'
import { RiImageCircleAiFill } from '@remixicon/react'
import { isMobileBrowser } from '@livekit/components-core'
import {
  EffectsConfiguration,
  EffectsConfigurationProps,
} from '../livekit/components/effects/EffectsConfiguration'
import { SelectDevice } from '../livekit/components/controls/Device/SelectDevice'
import { ToggleDevice } from '../livekit/components/controls/Device/ToggleDevice'
import { BackgroundProcessorFactory } from '../livekit/components/blur'
import { Lobby } from './Lobby'
import { openPermissionsDialog } from '@/stores/permissions'
import { isSafari } from '@/utils/livekit'
import { reportError } from '@/features/analytics/telemetry'
import {
  saveAudioInputDeviceId,
  saveAudioInputEnabled,
  saveAudioOutputDeviceId,
  saveVideoInputDeviceId,
  saveVideoInputEnabled,
  userChoicesStore,
} from '@/stores/userChoices'
import { useCannotUseDevice } from '../livekit/hooks/useCannotUseDevice'
import { useDeviceMissing } from '../livekit/hooks/useDeviceMissing'
import { useJoinTracks } from '../livekit/hooks/useJoinTracks'

const styles = {
  page: css({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    flexDirection: 'column',
    flexGrow: 1,
    gap: { base: '1rem', sm: '2rem', lg: '2rem' },
    lg: { flexDirection: 'row' },
  }),
  previewColumn: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
    maxWidth: '764px',
    lg: { height: '540px', flexGrow: 1 },
  }),
  previewStack: css({
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    width: '100%',
  }),
  previewFrame: css({
    borderRadius: '1rem',
    minWidth: { base: 0, sm: '320px' },
    maxWidth: '100%',
    margin: { base: '0.5rem', sm: '1rem', lg: '1rem 0.5rem 1rem 1rem' },
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  }),
  gradientTop: css({
    position: 'absolute',
    top: 0,
    height: '5rem',
    width: '100%',
    backgroundImage:
      'linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 40%, rgba(0, 0, 0, 0.1) 80%, rgba(0, 0, 0, 0) 100%)',
    zIndex: 1,
  }),
  gradientBottom: css({
    position: 'absolute',
    bottom: 0,
    height: '5rem',
    width: '100%',
    backgroundImage:
      'linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 35%, rgba(0, 0, 0, 0.1) 75%, rgba(0, 0, 0, 0) 100%)',
    zIndex: 1,
  }),
  previewAspect: css({
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
  }),
  previewSurface: css({
    backgroundColor: 'black',
    position: 'absolute',
    boxSizing: 'border-box',
    top: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  }),
  videoStatus: css({
    position: 'absolute',
    top: 0,
    width: '100%',
  }),
  videoCrop: css({
    width: '100%',
    height: 'auto',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    position: 'absolute',
    top: '-2px',
    left: '-2px',
    pointerEvents: 'none',
    transform: 'scale(1.02)',
  }),
  video: css({
    position: 'absolute',
    transform: 'rotateY(180deg)',
    opacity: 0,
    height: '100%',
    transition: 'opacity 0.3s ease-in-out',
    objectFit: 'cover',
  }),
  hintOverlay: css({
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
  }),
  hintText: css({
    fontWeight: '400',
    fontSize: { base: '1rem', sm: '1.25rem', lg: '1.5rem' },
    textWrap: 'balance',
    color: 'white',
  }),
  togglesOverlay: css({
    position: 'absolute',
    bottom: '1rem',
    zIndex: '1',
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    left: '50%',
    transform: 'translateX(-50%)',
  }),
  effectsOverlay: css({
    position: 'absolute',
    right: '1rem',
    bottom: '1rem',
    zIndex: '1',
  }),
  selectorsRow: css({
    display: 'flex',
    justifyContent: 'center',
    gap: '2%',
    width: '80%',
    marginX: 'auto',
  }),
  selectorItem: css({
    width: '30%',
  }),
  lobbyColumn: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: '0 0 360px',
    position: 'relative',
    margin: '1rem 1rem 1rem 0.5rem',
  }),
  effectsTitle: css({
    textStyle: 'h1',
    marginBottom: '0.25rem',
  }),
  effectsSubTitle: css({
    marginBottom: '1.5rem',
  }),
}

type PreviewTrack = LocalAudioTrack | LocalVideoTrack

const toggleTrack =
  (enabled: boolean, save: (v: boolean) => void, track?: PreviewTrack) =>
  async () => {
    save(!enabled)
    try {
      await (enabled ? track?.mute() : track?.unmute())
    } catch (err) {
      save(enabled)
      reportError('join_preview_failure', err as Error, {
        path: 'join_preview',
      })
    }
  }

const switchTrackDevice =
  (save: (id: string) => void, track?: PreviewTrack) => async (id: string) => {
    try {
      await track?.setDeviceId({ exact: id })
      save(id)
    } catch (err) {
      reportError('join_preview_failure', err as Error, {
        path: 'join_preview',
      })
    }
  }

function getPreviewMessages({
  cameraFound,
  cameraDenied,
  micDenied,
  videoEnabled,
  videoStarted,
}: {
  cameraFound: boolean
  cameraDenied: boolean
  micDenied: boolean
  videoEnabled: boolean
  videoStarted: boolean
}): { hint: string | null; permissionsButtonLabel: string | null } {
  if (!cameraFound) {
    return { hint: 'cameraNotFound', permissionsButtonLabel: null }
  }
  if (cameraDenied) {
    const key = micDenied ? 'cameraAndMicNotGranted' : 'cameraNotGranted'
    return { hint: key, permissionsButtonLabel: key }
  }
  if (!videoEnabled) {
    return { hint: 'cameraDisabled', permissionsButtonLabel: null }
  }
  if (!videoStarted) {
    return { hint: 'cameraStarting', permissionsButtonLabel: null }
  }
  return { hint: null, permissionsButtonLabel: null }
}

function useAttachedVideo(
  videoTrack: LocalVideoTrack | undefined,
  videoEnabled: boolean
) {
  const videoEl = useRef<HTMLVideoElement | null>(null)
  const [videoStarted, setVideoStarted] = useState(false)

  useEffect(() => {
    const element = videoEl.current
    if (!element || !videoTrack || !videoEnabled) {
      return
    }

    const handleLoaded = () => {
      setVideoStarted(true)
      element.style.opacity = '1'
    }

    videoTrack.attach(element)
    element.addEventListener('loadedmetadata', handleLoaded)

    return () => {
      videoTrack.detach(element)
      element.removeEventListener('loadedmetadata', handleLoaded)
      element.style.opacity = '0'
      setVideoStarted(false)
    }
  }, [videoTrack, videoEnabled])

  return { videoEl, videoStarted }
}

const Effects = ({
  videoTrack,
}: Pick<EffectsConfigurationProps, 'videoTrack'>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join.effects' })
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  if (!BackgroundProcessorFactory.isSupported() || isMobileBrowser()) {
    return null
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
        <Heading slot="title" level={1} className={styles.effectsTitle}>
          {t('title')}
        </Heading>
        <Text variant="subTitle" className={styles.effectsSubTitle}>
          {t('subTitle')}
        </Text>
        <EffectsConfiguration videoTrack={videoTrack} />
      </Dialog>
      <Button
        variant="whiteCircle"
        onPress={() => setIsDialogOpen(true)}
        tooltip={t('description')}
        aria-label={t('description')}
      >
        <RiImageCircleAiFill size={24} />
      </Button>
    </>
  )
}

const VideoPreview = ({
  videoTrack,
  audioTrack,
}: {
  videoTrack: LocalVideoTrack | undefined
  audioTrack: LocalAudioTrack | undefined
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })
  const { audioEnabled, videoEnabled } = useSnapshot(userChoicesStore)

  const cameraDenied = useCannotUseDevice('videoinput')
  const micDenied = useCannotUseDevice('audioinput')
  const cameraMissing = useDeviceMissing('videoinput')

  const { videoEl, videoStarted } = useAttachedVideo(videoTrack, videoEnabled)

  const { hint, permissionsButtonLabel } = getPreviewMessages({
    cameraFound: !cameraMissing,
    cameraDenied,
    micDenied,
    videoEnabled,
    videoStarted,
  })

  return (
    <div className={styles.previewFrame}>
      <div className={styles.gradientTop} />
      <div className={styles.gradientBottom} />
      <div className={styles.previewAspect}>
        <div className={styles.previewSurface}>
          <div
            aria-label={t(
              `videoPreview.${videoEnabled ? 'enabled' : 'disabled'}`
            )}
            role="status"
            className={styles.videoStatus}
          >
            <div className={styles.videoCrop}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoEl}
                width="1280"
                height="720"
                style={{
                  display: !videoEnabled || cameraDenied ? 'none' : undefined,
                }}
                className={styles.video}
                disablePictureInPicture
                disableRemotePlayback
              />
            </div>
          </div>
          <div role="alert" className={styles.hintOverlay}>
            <p className={styles.hintText}>{hint && t(hint)}</p>
            {permissionsButtonLabel && (
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
        <div className={styles.togglesOverlay}>
          <ToggleDevice
            kind="audioinput"
            context="join"
            enabled={audioEnabled}
            toggle={toggleTrack(
              audioEnabled,
              saveAudioInputEnabled,
              audioTrack
            )}
          />
          <ToggleDevice
            kind="videoinput"
            context="join"
            enabled={videoEnabled}
            toggle={toggleTrack(
              videoEnabled,
              saveVideoInputEnabled,
              videoTrack
            )}
          />
        </div>
        <div className={styles.effectsOverlay}>
          {videoTrack && <Effects videoTrack={videoTrack} />}
        </div>
      </div>
    </div>
  )
}

const DeviceSelectors = ({
  videoTrack,
  audioTrack,
}: {
  videoTrack: LocalVideoTrack | undefined
  audioTrack: LocalAudioTrack | undefined
}) => {
  const { audioDeviceId, audioOutputDeviceId, videoDeviceId } =
    useSnapshot(userChoicesStore)

  return (
    <div className={styles.selectorsRow}>
      <div className={styles.selectorItem}>
        <SelectDevice
          kind="audioinput"
          id={audioDeviceId}
          track={audioTrack}
          onSubmit={switchTrackDevice(saveAudioInputDeviceId, audioTrack)}
        />
      </div>
      {!isSafari() && (
        <div className={styles.selectorItem}>
          <SelectDevice
            kind="audiooutput"
            id={audioOutputDeviceId}
            onSubmit={saveAudioOutputDeviceId}
          />
        </div>
      )}
      <div className={styles.selectorItem}>
        <SelectDevice
          kind="videoinput"
          id={videoDeviceId}
          onSubmit={switchTrackDevice(saveVideoInputDeviceId, videoTrack)}
        />
      </div>
    </div>
  )
}

export const Join = ({
  enterRoom,
  roomId,
}: {
  enterRoom: () => void
  roomId: string
}) => {
  const { audioTrack, videoTrack } = useJoinTracks()

  return (
    <Screen footer={false}>
      <div className={styles.page}>
        <div className={styles.previewColumn}>
          <div className={styles.previewStack}>
            <VideoPreview videoTrack={videoTrack} audioTrack={audioTrack} />
            <DeviceSelectors videoTrack={videoTrack} audioTrack={audioTrack} />
          </div>
        </div>
        <div className={styles.lobbyColumn}>
          <Lobby roomId={roomId} enterRoom={enterRoom} />
        </div>
      </div>
    </Screen>
  )
}

import { DialogProps, Field, H } from '@/primitives'

import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { useMediaDeviceSelect, useRoomContext } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { HStack } from '@/styled-system/jsx'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { ReactNode, useCallback, useEffect, useState } from 'react'
import { css } from '@/styled-system/css'
import {
  createLocalVideoTrack,
  LocalVideoTrack,
  Track,
  VideoPresets,
} from 'livekit-client'
import { BackgroundProcessorFactory } from '@/features/rooms/livekit/components/blur'
import { VideoResolution } from '@/stores/userChoices'

type RowWrapperProps = {
  heading: string
  children: ReactNode[]
}

const RowWrapper = ({ heading, children }: RowWrapperProps) => {
  return (
    <>
      <H lvl={2}>{heading}</H>
      <HStack
        gap={0}
        style={{
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: '1 1 215px',
            minWidth: 0,
          }}
        >
          {children[0]}
        </div>
        <div
          style={{
            width: '10rem',
            justifyContent: 'center',
            display: 'flex',
            paddingLeft: '1.5rem',
          }}
        >
          {children[1]}
        </div>
      </HStack>
    </>
  )
}

export type VideoTabProps = Pick<DialogProps, 'onOpenChange'> &
  Pick<TabPanelProps, 'id'>

type DeviceItems = Array<{ value: string; label: string }>

export const VideoTab = ({ id }: VideoTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'video' })
  const { localParticipant } = useRoomContext()

  const {
    userChoices: { videoDeviceId, processorSerialized, videoPublishResolution },
    saveVideoInputDeviceId,
    saveVideoPublishResolution,
  } = usePersistentUserChoices()
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  )

  const videoCallbackRef = useCallback((element: HTMLVideoElement | null) => {
    setVideoElement(element)
  }, [])

  const { devices: devicesIn, setActiveMediaDevice: setActiveMediaDeviceIn } =
    useMediaDeviceSelect({ kind: 'videoinput' })

  const itemsIn: DeviceItems = devicesIn.map((d) => ({
    value: d.deviceId,
    label: d.label,
  }))

  // The Permissions API is not fully supported in Firefox and Safari, and attempting to use it for camera permissions
  // may raise an error. As a workaround, we infer camera permission status by checking if the list of camera input
  // devices (devicesIn) is non-empty. If the list has one or more devices, we assume the user has granted camera access.
  const isCamEnabled = devicesIn?.length > 0

  const disabledProps = isCamEnabled
    ? {}
    : {
        placeholder: t('permissionsRequired'),
        isDisabled: true,
      }

  const handleVideoResolutionChange = async (key: 'h720' | 'h360' | 'h180') => {
    const videoPublication = localParticipant.getTrackPublication(
      Track.Source.Camera
    )
    const videoTrack = videoPublication?.track
    if (videoTrack) {
      saveVideoPublishResolution(key)
      await videoTrack.restartTrack({
        resolution: VideoPresets[key].resolution,
        deviceId: { exact: videoDeviceId },
        processor:
          BackgroundProcessorFactory.deserializeProcessor(processorSerialized),
      })
    }
  }

  useEffect(() => {
    let videoTrack: LocalVideoTrack | null = null

    const setUpVideoTrack = async () => {
      if (videoElement) {
        videoTrack = await createLocalVideoTrack({ deviceId: videoDeviceId })
        videoTrack.attach(videoElement)
      }
    }

    setUpVideoTrack()

    return () => {
      if (videoElement && videoTrack) {
        videoTrack.detach()
        videoTrack.stop()
      }
    }
  }, [videoDeviceId, videoElement])

  return (
    <TabPanel padding={'md'} flex id={id}>
      <RowWrapper heading={t('camera.heading')}>
        <Field
          type="select"
          label={t('camera.label')}
          items={itemsIn}
          selectedKey={videoDeviceId}
          onSelectionChange={async (key) => {
            await setActiveMediaDeviceIn(key as string)
            saveVideoInputDeviceId(key as string)
          }}
          {...disabledProps}
          style={{
            width: '100%',
          }}
        />
        <div
          role="status"
          aria-label={t(
            `camera.previewAriaLabel.${localParticipant.isCameraEnabled ? 'enabled' : 'disabled'}`
          )}
        >
          {localParticipant.isCameraEnabled ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoCallbackRef}
                width="160px"
                height="56px"
                style={{
                  display: !localParticipant.isCameraEnabled
                    ? 'none'
                    : undefined,
                }}
                className={css({
                  transform: 'rotateY(180deg)',
                  height: '69px',
                  width: '160px',
                })}
                disablePictureInPicture
                disableRemotePlayback
              />
            </>
          ) : (
            <span
              className={css({
                display: 'flex',
                justifyContent: 'center',
                textAlign: 'center',
              })}
            >
              {t('camera.disabled')}
            </span>
          )}
        </div>
      </RowWrapper>
      <H lvl={2}>{t('resolution.heading')}</H>
      <HStack
        gap={0}
        style={{
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: '1 1 215px',
            minWidth: 0,
          }}
        >
          <Field
            type="select"
            label={t('resolution.publish.label')}
            items={[
              {
                value: 'h720',
                label: `${t('resolution.publish.items.high')} (720p)`,
              },
              {
                value: 'h360',
                label: `${t('resolution.publish.items.medium')} (360p)`,
              },
              {
                value: 'h180',
                label: `${t('resolution.publish.items.low')} (180p)`,
              },
            ]}
            selectedKey={videoPublishResolution}
            onSelectionChange={async (key) => {
              await handleVideoResolutionChange(key as VideoResolution)
            }}
            style={{
              width: '100%',
            }}
          />
        </div>
        <div
          style={{
            width: '10rem',
            justifyContent: 'center',
            display: 'flex',
            paddingLeft: '1.5rem',
          }}
        />
      </HStack>
    </TabPanel>
  )
}

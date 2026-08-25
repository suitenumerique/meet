import { DialogProps, Field } from '@/primitives'

import { TabPanel, type TabPanelProps } from '@/primitives/Tabs'
import { useMediaDeviceSelect, useRoomContext } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { css } from '@/styled-system/css'
import {
  createLocalVideoTrack,
  type LocalVideoTrack,
  Track,
  VideoPresets,
  VideoQuality,
} from 'livekit-client'
import { BackgroundProcessorFactory } from '@/features/rooms/livekit/components/blur'
import {
  saveVideoInputDeviceId,
  saveVideoPublishResolution,
  saveVideoSubscribeQuality,
  userChoicesStore,
  VideoResolution,
} from '@/stores/userChoices'
import { RowWrapper } from './layout/RowWrapper'
import { useSnapshot } from 'valtio'
import {
  disablePerformanceMode,
  enablePerformanceMode,
  performanceModeStore,
} from '@/stores/performanceMode'

export type VideoTabProps = Pick<DialogProps, 'onOpenChange'> &
  Pick<TabPanelProps, 'id'>

type DeviceItems = Array<{ value: string; label: string }>

const EMPTY_PROPS = {}

export const VideoTab = ({ id }: VideoTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'video' })
  const { localParticipant } = useRoomContext()

  const {
    videoDeviceId,
    processorConfig,
    videoPublishResolution,
    videoSubscribeQuality,
  } = useSnapshot(userChoicesStore)

  const { enabled: isPerformanceModeEnabled } =
    useSnapshot(performanceModeStore)

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
    ? EMPTY_PROPS
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
          BackgroundProcessorFactory.fromProcessorConfig(processorConfig),
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

  const resolutionItems = useMemo(() => {
    return [
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
    ]
  }, [t])

  const videoQualityItems = useMemo(() => {
    return [
      {
        value: VideoQuality.HIGH.toString(),
        label: t('resolution.subscribe.items.high'),
      },
      {
        value: VideoQuality.MEDIUM.toString(),
        label: t('resolution.subscribe.items.medium'),
      },
      {
        value: VideoQuality.LOW.toString(),
        label: t('resolution.subscribe.items.low'),
      },
    ]
  }, [t])

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
              {/* eslint-disable jsx-a11y/media-has-caption */}
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
      <RowWrapper heading={t('resolution.heading')}>
        <Field
          type="select"
          label={t('resolution.publish.label')}
          items={resolutionItems}
          selectedKey={
            isPerformanceModeEnabled ? 'h360' : videoPublishResolution
          }
          onSelectionChange={async (key) => {
            await handleVideoResolutionChange(key as VideoResolution)
          }}
          isDisabled={isPerformanceModeEnabled}
          style={{
            width: '100%',
          }}
        />
        <></>
      </RowWrapper>
      <RowWrapper>
        <Field
          type="select"
          label={t('resolution.subscribe.label')}
          items={videoQualityItems}
          selectedKey={
            isPerformanceModeEnabled
              ? VideoQuality.LOW.toString()
              : videoSubscribeQuality?.toString()
          }
          onSelectionChange={(key) => {
            if (key == undefined) return
            const selectedQuality = Number(String(key))
            saveVideoSubscribeQuality(selectedQuality)
          }}
          isDisabled={isPerformanceModeEnabled}
          style={{
            width: '100%',
          }}
        />
        <></>
      </RowWrapper>
      <RowWrapper heading={t('performance.heading')}>
        <Field
          type="switch"
          label={t('performance.label')}
          description={t('performance.description')}
          isSelected={isPerformanceModeEnabled}
          onChange={(value) => {
            if (value) {
              enablePerformanceMode('manual')
            } else {
              disablePerformanceMode()
            }
          }}
          wrapperProps={{
            noMargin: true,
            fullWidth: true,
          }}
        />
        <></>
      </RowWrapper>
    </TabPanel>
  )
}

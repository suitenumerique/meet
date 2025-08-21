import { useTranslation } from 'react-i18next'
import {
  useMediaDeviceSelect,
  useTrackToggle,
  UseTrackToggleProps,
} from '@livekit/components-react'
import { Button, Menu, MenuList } from '@/primitives'
import { RiArrowUpSLine, RiVideoOffLine, RiVideoOnLine } from '@remixicon/react'
import { LocalVideoTrack, Track, VideoCaptureOptions } from 'livekit-client'

import { ToggleDevice } from '@/features/rooms/livekit/components/controls/ToggleDevice'
import { css } from '@/styled-system/css'
import { usePersistentUserChoices } from '../../../hooks/usePersistentUserChoices'
import { BackgroundProcessorFactory } from '../../blur'
import { useSnapshot } from 'valtio'
import { permissionsStore } from '@/stores/permissions'
import { ToggleDeviceConfig } from '../../../config/ToggleDeviceConfig'
import Source = Track.Source
import * as React from 'react'

type VideoDeviceControlProps = Omit<
  UseTrackToggleProps<Source.Camera>,
  'source' | 'onChange'
> & {
  track?: LocalVideoTrack
  hideMenu?: boolean
}

export const VideoDeviceControl = ({
  track,
  hideMenu,
  ...props
}: VideoDeviceControlProps) => {
  const config: ToggleDeviceConfig = {
    kind: 'videoinput',
    iconOn: RiVideoOnLine,
    iconOff: RiVideoOffLine,
    shortcut: {
      key: 'e',
      ctrlKey: true,
    },
  }

  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const { userChoices, saveVideoInputDeviceId, saveVideoInputEnabled } =
    usePersistentUserChoices()

  const onChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) =>
      isUserInitiated ? saveVideoInputEnabled(enabled) : null,
    [saveVideoInputEnabled]
  )

  const trackProps = useTrackToggle({
    source: Source.Camera,
    onChange,
    ...props,
  })

  const permissions = useSnapshot(permissionsStore)

  const isPermissionDeniedOrPrompted =
    permissions.isCameraDenied || permissions.isCameraPrompted

  const toggle = () => {
    /**
     * We need to make sure that we apply the in-memory processor when re-enabling the camera.
     * Before, we had the following bug:
     * 1 - Configure a processor on join screen
     * 2 - Turn off camera on join screen
     * 3 - Join the room
     * 4 - Turn on the camera
     * 5 - No processor is applied to the camera
     * Expected: The processor is applied.
     *
     * See https://github.com/numerique-gouv/meet/pull/309#issuecomment-2622404121
     */
    const processor = BackgroundProcessorFactory.deserializeProcessor(
      userChoices.processorSerialized
    )

    const toggle = trackProps.toggle as (
      forceState: boolean,
      captureOptions: VideoCaptureOptions
    ) => Promise<void>

    toggle(!trackProps.enabled, {
      processor: processor,
    } as VideoCaptureOptions)
  }

  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind: 'videoinput', track })

  const selectLabel = t('videoinput.choose')

  return (
    <div
      className={css({
        display: 'flex',
        gap: '1px',
      })}
    >
      <ToggleDevice
        {...trackProps}
        config={config}
        variant="primaryDark"
        toggle={toggle}
        isPermissionDeniedOrPrompted={isPermissionDeniedOrPrompted}
        toggleButtonProps={{
          ...(hideMenu
            ? {
                groupPosition: undefined,
              }
            : {}),
        }}
      />
      {!hideMenu && (
        <Menu variant="dark">
          <Button
            isDisabled={isPermissionDeniedOrPrompted}
            tooltip={selectLabel}
            aria-label={selectLabel}
            groupPosition="right"
            square
            variant={
              trackProps.enabled && !isPermissionDeniedOrPrompted
                ? 'primaryDark'
                : 'error2'
            }
          >
            <RiArrowUpSLine />
          </Button>
          <MenuList
            items={devices.map((d) => ({
              value: d.deviceId,
              label: d.label,
            }))}
            selectedItem={activeDeviceId}
            onAction={(value) => {
              setActiveMediaDevice(value as string)
              saveVideoInputDeviceId(value as string)
            }}
            variant="dark"
          />
        </Menu>
      )}
    </div>
  )
}

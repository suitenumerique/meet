import { useTranslation } from 'react-i18next'
import {
  useMediaDeviceSelect,
  useTrackToggle,
  UseTrackToggleProps,
} from '@livekit/components-react'
import { Button, Menu, MenuList } from '@/primitives'
import { RiArrowUpSLine, RiMicLine, RiMicOffLine } from '@remixicon/react'
import { LocalAudioTrack, LocalVideoTrack, Track } from 'livekit-client'

import { ToggleDevice } from '@/features/rooms/livekit/components/controls/ToggleDevice.tsx'
import { css } from '@/styled-system/css'
import { usePersistentUserChoices } from '../../../hooks/usePersistentUserChoices'
import { useSnapshot } from 'valtio'
import { permissionsStore } from '@/stores/permissions'
import { ToggleDeviceConfig } from '../../../config/ToggleDeviceConfig'
import Source = Track.Source
import * as React from 'react'

type AudioDevicesControlProps = Omit<
  UseTrackToggleProps<Source.Microphone>,
  'source' | 'onChange'
> & {
  track?: LocalAudioTrack | LocalVideoTrack
  hideMenu?: boolean
}

export const AudioDevicesControl = ({
  track,
  hideMenu,
  ...props
}: AudioDevicesControlProps) => {
  const config: ToggleDeviceConfig = {
    kind: 'audioinput',
    iconOn: RiMicLine,
    iconOff: RiMicOffLine,
    shortcut: {
      key: 'd',
      ctrlKey: true,
    },
    longPress: {
      key: 'Space',
    },
  }
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const { saveAudioInputDeviceId, saveAudioInputEnabled } =
    usePersistentUserChoices()

  const onChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) =>
      isUserInitiated ? saveAudioInputEnabled(enabled) : null,
    [saveAudioInputEnabled]
  )

  const trackProps = useTrackToggle({
    source: Source.Microphone,
    onChange,
    ...props,
  })

  const permissions = useSnapshot(permissionsStore)
  const isPermissionDeniedOrPrompted =
    permissions.isMicrophoneDenied || permissions.isMicrophonePrompted

  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind: 'audioinput', track })

  const selectLabel = t('audioinput.choose')

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
        toggle={trackProps.toggle}
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
              saveAudioInputDeviceId(value as string)
            }}
            variant="dark"
          />
        </Menu>
      )}
    </div>
  )
}

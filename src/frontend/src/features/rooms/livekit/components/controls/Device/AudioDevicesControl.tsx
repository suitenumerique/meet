import { useTranslation } from 'react-i18next'
import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { Button, Popover } from '@/primitives'
import { RiArrowUpSLine, RiMicLine, RiMicOffLine } from '@remixicon/react'
import { Track } from 'livekit-client'

import { ToggleDevice } from '@/features/rooms/livekit/components/controls/ToggleDevice.tsx'
import { css } from '@/styled-system/css'
import { usePersistentUserChoices } from '../../../hooks/usePersistentUserChoices'
import { useSnapshot } from 'valtio'
import { permissionsStore } from '@/stores/permissions'
import { ToggleDeviceConfig } from '../../../config/ToggleDeviceConfig'
import Source = Track.Source
import * as React from 'react'
import { SelectDevice } from './SelectDevice'

type AudioDevicesControlProps = Omit<
  UseTrackToggleProps<Source.Microphone>,
  'source' | 'onChange'
> & {
  hideMenu?: boolean
}

export const AudioDevicesControl = ({
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

  const {
    userChoices: { audioDeviceId, audioOutputDeviceId },
    saveAudioInputDeviceId,
    saveAudioInputEnabled,
    saveAudioOutputDeviceId,
  } = usePersistentUserChoices()

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
        <Popover variant="dark" withArrow={false}>
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
          <div
            className={css({
              maxWidth: '36rem',
              padding: '0.15rem',
              display: 'flex',
              gap: '0.5rem',
            })}
          >
            <div
              style={{
                flex: '1 1 0',
                minWidth: 0,
              }}
            >
              <SelectDevice
                context="room"
                kind="audioinput"
                id={audioDeviceId}
                onSubmit={saveAudioInputDeviceId}
              />
            </div>
            <div
              style={{
                flex: '1 1 0',
                minWidth: 0,
              }}
            >
              <SelectDevice
                context="room"
                kind="audiooutput"
                id={audioOutputDeviceId}
                onSubmit={saveAudioOutputDeviceId}
              />
            </div>
          </div>
        </Popover>
      )}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { Button, Popover } from '@/primitives'
import { RiArrowUpSLine } from '@remixicon/react'
import { Track } from 'livekit-client'

import { ToggleDevice } from './ToggleDevice'
import { css } from '@/styled-system/css'
import { usePersistentUserChoices } from '../../../hooks/usePersistentUserChoices'
import { useCannotUseDevice } from '../../../hooks/useCannotUseDevice'
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

  const cannotUseDevice = useCannotUseDevice('audioinput')
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
        kind="audioinput"
        toggle={trackProps.toggle as () => Promise<void>}
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
            tooltip={selectLabel}
            aria-label={selectLabel}
            groupPosition="right"
            square
            variant={
              trackProps.enabled && !cannotUseDevice ? 'primaryDark' : 'error2'
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

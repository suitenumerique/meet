import { useTranslation } from 'react-i18next'
import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { Button, Popover } from '@/primitives'
import { RiArrowUpSLine } from '@remixicon/react'
import { Track } from 'livekit-client'

import { ToggleDevice } from './ToggleDevice'
import { css } from '@/styled-system/css'
import { usePersistentUserChoices } from '../../../hooks/usePersistentUserChoices'
import { useCanPublishTrack } from '../../../hooks/useCanPublishTrack'
import { useCannotUseDevice } from '../../../hooks/useCannotUseDevice'
import * as React from 'react'
import { SelectDevice } from './SelectDevice'
import { SettingsButton } from './SettingsButton'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { TrackSource } from '@livekit/protocol'
import Source = Track.Source
import { isSafari } from '@/utils/livekit'

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
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })

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

  const kind = 'audioinput'
  const cannotUseDevice = useCannotUseDevice(kind)
  const selectLabel = t(`settings.${SettingsDialogExtendedKey.AUDIO}`)

  const canPublishTrack = useCanPublishTrack(TrackSource.MICROPHONE)

  return (
    <div
      className={css({
        display: 'flex',
        gap: '1px',
      })}
    >
      <ToggleDevice
        {...trackProps}
        isDisabled={!canPublishTrack}
        kind={kind}
        toggle={trackProps.toggle as () => Promise<void>}
        overrideToggleButtonProps={{
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
              !canPublishTrack || !trackProps.enabled || cannotUseDevice
                ? 'error2'
                : 'primaryDark'
            }
          >
            <RiArrowUpSLine />
          </Button>
          {({ close }) => (
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
                  kind={kind}
                  id={audioDeviceId}
                  onSubmit={saveAudioInputDeviceId}
                />
              </div>
              {!isSafari() && (
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
              )}
              <SettingsButton
                settingTab={SettingsDialogExtendedKey.AUDIO}
                onPress={close}
              />
            </div>
          )}
        </Popover>
      )}
    </div>
  )
}

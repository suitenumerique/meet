import { DialogProps, Field, Switch, Text } from '@/primitives'

import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { isSafari } from '@/utils/livekit'
import { useTranslation } from 'react-i18next'
import { SoundTester } from '@/components/SoundTester'
import { ActiveSpeaker } from '@/features/rooms/components/ActiveSpeaker'
import { useLocalAudioLevel } from '@/features/rooms/livekit/hooks/useLocalAudioLevel'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { useNoiseReductionAvailable } from '@/features/rooms/livekit/hooks/useNoiseReductionAvailable'
import posthog from 'posthog-js'
import { RowWrapper } from './layout/RowWrapper'

export type AudioTabProps = Pick<DialogProps, 'onOpenChange'> &
  Pick<TabPanelProps, 'id'>

type DeviceItems = Array<{ value: string; label: string }>

export const AudioTab = ({ id }: AudioTabProps) => {
  const { t } = useTranslation('settings')

  const {
    userChoices: { noiseReductionEnabled, audioDeviceId, audioOutputDeviceId },
    saveAudioInputDeviceId,
    saveNoiseReductionEnabled,
    saveAudioOutputDeviceId,
  } = usePersistentUserChoices()

  const isLocalSpeaking = useLocalAudioLevel(audioDeviceId)

  const { devices: devicesOut, setActiveMediaDevice: setActiveMediaDeviceOut } =
    useMediaDeviceSelect({ kind: 'audiooutput' })

  const { devices: devicesIn, setActiveMediaDevice: setActiveMediaDeviceIn } =
    useMediaDeviceSelect({ kind: 'audioinput' })

  const itemsOut: DeviceItems = devicesOut.map((d) => ({
    value: d.deviceId,
    label: d.label,
  }))

  const itemsIn: DeviceItems = devicesIn.map((d) => ({
    value: d.deviceId,
    label: d.label,
  }))

  // The Permissions API is not fully supported in Firefox and Safari, and attempting to use it for microphone permissions
  // may raise an error. As a workaround, we infer microphone permission status by checking if the list of audio input
  // devices (devicesIn) is non-empty. If the list has one or more devices, we assume the user has granted microphone access.
  const isMicEnabled = devicesIn?.length > 0

  const disabledProps = isMicEnabled
    ? {}
    : {
        placeholder: t('audio.permissionsRequired'),
        isDisabled: true,
        defaultSelectedKey: undefined,
      }

  const noiseReductionAvailable = useNoiseReductionAvailable()

  return (
    <TabPanel padding={'md'} flex id={id}>
      <RowWrapper heading={t('audio.microphone.heading')}>
        <Field
          type="select"
          label={t('audio.microphone.label')}
          items={itemsIn}
          selectedKey={audioDeviceId}
          onSelectionChange={async (key) => {
            await setActiveMediaDeviceIn(key as string)
            saveAudioInputDeviceId(key as string)
          }}
          {...disabledProps}
          style={{
            width: '100%',
          }}
        />
        <ActiveSpeaker isSpeaking={isLocalSpeaking} />
      </RowWrapper>
      {/* Safari has a known limitation where its implementation of 'enumerateDevices' does not include audio output devices.
        To prevent errors or an empty selection list, we only render the speakers selection field on non-Safari browsers. */}
      {!isSafari() ? (
        <RowWrapper heading={t('audio.speakers.heading')}>
          <Field
            type="select"
            label={t('audio.speakers.label')}
            items={itemsOut}
            selectedKey={audioOutputDeviceId}
            onSelectionChange={async (key) => {
              await setActiveMediaDeviceOut(key as string)
              saveAudioOutputDeviceId(key as string)
            }}
            {...disabledProps}
            style={{
              minWidth: 0,
            }}
          />
          <SoundTester />
        </RowWrapper>
      ) : (
        <RowWrapper heading={t('audio.speakers.heading')}>
          <Text variant="warning" margin="md">
            {t('audio.speakers.safariWarning')}
          </Text>
          <div />
        </RowWrapper>
      )}
      {noiseReductionAvailable && (
        <RowWrapper heading={t('audio.noiseReduction.heading')} beta>
          <Switch
            aria-label={t(
              `audio.noiseReduction.ariaLabel.${noiseReductionEnabled ? 'disable' : 'enable'}`
            )}
            isSelected={noiseReductionEnabled}
            onChange={(v) => {
              saveNoiseReductionEnabled(v)
              if (v) posthog.capture('noise-reduction-init')
            }}
          >
            {t('audio.noiseReduction.label')}
          </Switch>
          <div />
        </RowWrapper>
      )}
    </TabPanel>
  )
}

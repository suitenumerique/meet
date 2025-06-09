import { DialogProps, Field, H, Switch } from '@/primitives'

import { TabPanel, TabPanelProps } from '@/primitives/Tabs'
import {
  useIsSpeaking,
  useMediaDeviceSelect,
  useRoomContext,
} from '@livekit/components-react'
import { isSafari } from '@/utils/livekit'
import { useTranslation } from 'react-i18next'
import { SoundTester } from '@/components/SoundTester'
import { HStack } from '@/styled-system/jsx'
import { ActiveSpeaker } from '@/features/rooms/components/ActiveSpeaker'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { ReactNode } from 'react'
import { css } from '@/styled-system/css'

type RowWrapperProps = {
  heading: string
  children: ReactNode[]
  beta?: boolean
}

const BetaBadge = () => (
  <span
    className={css({
      content: '"Beta"',
      display: 'block',
      letterSpacing: '-0.02rem',
      padding: '0 0.25rem',
      backgroundColor: '#E8EDFF',
      color: '#0063CB',
      fontSize: '12px',
      fontWeight: 500,
      margin: '0 0 0.9375rem 0.3125rem',
      lineHeight: '1rem',
      borderRadius: '4px',
      width: 'fit-content',
      height: 'fit-content',
      marginTop: { base: '10px', sm: '5px' },
    })}
  >
    Beta
  </span>
)

const RowWrapper = ({ heading, children, beta }: RowWrapperProps) => {
  return (
    <>
      <HStack>
        <H lvl={2}>{heading}</H>
        {beta && <BetaBadge />}
      </HStack>
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

export type AudioTabProps = Pick<DialogProps, 'onOpenChange'> &
  Pick<TabPanelProps, 'id'>

type DeviceItems = Array<{ value: string; label: string }>

export const AudioTab = ({ id }: AudioTabProps) => {
  const { t } = useTranslation('settings')
  const { localParticipant } = useRoomContext()

  const {
    userChoices: { noiseReductionEnabled },
    saveAudioInputDeviceId,
    saveNoiseReductionEnabled,
  } = usePersistentUserChoices()

  const isSpeaking = useIsSpeaking(localParticipant)

  const {
    devices: devicesOut,
    activeDeviceId: activeDeviceIdOut,
    setActiveMediaDevice: setActiveMediaDeviceOut,
  } = useMediaDeviceSelect({ kind: 'audiooutput' })

  const {
    devices: devicesIn,
    activeDeviceId: activeDeviceIdIn,
    setActiveMediaDevice: setActiveMediaDeviceIn,
  } = useMediaDeviceSelect({ kind: 'audioinput' })

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

  // No API to directly query the default audio device; this function heuristically finds it.
  // Returns the item with value 'default' if present; otherwise, returns the first item in the list.
  const getDefaultSelectedKey = (items: DeviceItems) => {
    if (!items || items.length === 0) return
    const defaultItem =
      items.find((item) => item.value === 'default') || items[0]
    return defaultItem.value
  }

  return (
    <TabPanel padding={'md'} flex id={id}>
      <RowWrapper heading={t('audio.microphone.heading')}>
        <Field
          type="select"
          label={t('audio.microphone.label')}
          items={itemsIn}
          defaultSelectedKey={
            activeDeviceIdIn || getDefaultSelectedKey(itemsIn)
          }
          onSelectionChange={(key) => {
            setActiveMediaDeviceIn(key as string)
            saveAudioInputDeviceId(key as string)
          }}
          {...disabledProps}
          style={{
            width: '100%',
          }}
        />
        <>
          {localParticipant.isMicrophoneEnabled ? (
            <ActiveSpeaker isSpeaking={isSpeaking} />
          ) : (
            <span>{t('audio.microphone.disabled')}</span>
          )}
        </>
      </RowWrapper>
      {/* Safari has a known limitation where its implementation of 'enumerateDevices' does not include audio output devices.
        To prevent errors or an empty selection list, we only render the speakers selection field on non-Safari browsers. */}
      {!isSafari() && (
        <RowWrapper heading={t('audio.speakers.heading')}>
          <Field
            type="select"
            label={t('audio.speakers.label')}
            items={itemsOut}
            defaultSelectedKey={
              activeDeviceIdOut || getDefaultSelectedKey(itemsOut)
            }
            onSelectionChange={async (key) =>
              setActiveMediaDeviceOut(key as string)
            }
            {...disabledProps}
            style={{
              minWidth: 0,
            }}
          />
          <SoundTester />
        </RowWrapper>
      )}
      <RowWrapper heading={t('audio.noiseReduction.heading')} beta>
        <Switch
          aria-label={t(
            `audio.noiseReduction.ariaLabel.${noiseReductionEnabled ? 'disable' : 'enable'}`
          )}
          isSelected={noiseReductionEnabled}
          onChange={(v) => {
            saveNoiseReductionEnabled(v)
          }}
        >
          {t('audio.noiseReduction.label')}
        </Switch>
        <div />
      </RowWrapper>
    </TabPanel>
  )
}

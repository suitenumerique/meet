import { ToggleButton } from '@/primitives'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useMemo, useState } from 'react'
import { appendShortcutLabel } from '@/features/shortcuts/utils'
import { useTranslation } from 'react-i18next'
import { PermissionNeededButton } from './PermissionNeededButton'
import useLongPress from '@/features/shortcuts/useLongPress'
import { ActiveSpeaker } from '@/features/rooms/components/ActiveSpeaker'
import {
  useIsSpeaking,
  useLocalParticipant,
  useMaybeRoomContext,
} from '@livekit/components-react'
import { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { openPermissionsDialog } from '@/stores/permissions'
import { useCannotUseDevice } from '../../../hooks/useCannotUseDevice'
import { useDeviceIcons } from '../../../hooks/useDeviceIcons'
import { useDeviceShortcut } from '../../../hooks/useDeviceShortcut'
import { ToggleSource, CaptureOptionsBySource } from '@livekit/components-core'

type ToggleDeviceStyleProps = {
  variant?: NonNullable<ButtonRecipeProps>['variant']
  errorVariant?: NonNullable<ButtonRecipeProps>['variant']
  toggleButtonProps?: Partial<ToggleButtonProps>
}

export type ToggleDeviceProps<T extends ToggleSource> = {
  enabled: boolean
  toggle: (
    forceState?: boolean,
    captureOptions?: CaptureOptionsBySource<T>
  ) => Promise<void | boolean | undefined>
  context?: 'room' | 'join'
  kind: 'audioinput' | 'videoinput'
  overrideToggleButtonProps?: Partial<ToggleButtonProps>
}

export const ToggleDevice = <T extends ToggleSource>({
  kind,
  enabled,
  toggle,
  context = 'room',
  overrideToggleButtonProps,
}: ToggleDeviceProps<T>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })

  const {
    variant,
    errorVariant,
    toggleButtonProps: computedToggleButtonProps,
  } = useMemo<ToggleDeviceStyleProps>(() => {
    if (context === 'join') {
      return {
        variant: 'whiteCircle',
        errorVariant: 'errorCircle',
        toggleButtonProps: {
          groupPosition: undefined,
        },
      } as ToggleDeviceStyleProps
    }
    return {
      variant: 'primaryDark',
      errorVariant: 'error2',
      toggleButtonProps: {
        groupPosition: 'left',
      },
    } as ToggleDeviceStyleProps
  }, [context])

  const [pushToTalk, setPushToTalk] = useState(false)

  const onKeyDown = () => {
    if (pushToTalk || enabled) return
    toggle()
    setPushToTalk(true)
  }
  const onKeyUp = () => {
    if (!pushToTalk) return
    toggle()
    setPushToTalk(false)
  }

  const deviceIcons = useDeviceIcons(kind)
  const cannotUseDevice = useCannotUseDevice(kind)
  const deviceShortcut = useDeviceShortcut(kind)

  useRegisterKeyboardShortcut({
    shortcut: deviceShortcut,
    handler: toggle,
    isDisabled: cannotUseDevice,
  })
  useLongPress({
    keyCode: kind === 'audioinput' ? 'Space' : undefined,
    onKeyDown,
    onKeyUp,
    isDisabled: cannotUseDevice,
  })

  const toggleLabel = useMemo(() => {
    const label = t(enabled ? 'disable' : 'enable', {
      keyPrefix: `selectDevice.${kind}`,
    })
    return deviceShortcut ? appendShortcutLabel(label, deviceShortcut) : label
  }, [enabled, kind, deviceShortcut, t])

  const Icon =
    enabled && !cannotUseDevice ? deviceIcons.toggleOn : deviceIcons.toggleOff

  const roomContext = useMaybeRoomContext()
  if (kind === 'audioinput' && pushToTalk && roomContext) {
    return <ActiveSpeakerWrapper />
  }

  return (
    <div style={{ position: 'relative' }}>
      {cannotUseDevice && <PermissionNeededButton />}
      <ToggleButton
        isSelected={!enabled}
        variant={enabled && !cannotUseDevice ? variant : errorVariant}
        shySelected
        onPress={() => (cannotUseDevice ? openPermissionsDialog() : toggle())}
        aria-label={toggleLabel}
        tooltip={
          cannotUseDevice
            ? t('tooltip', { keyPrefix: 'permissionsButton' })
            : toggleLabel
        }
        {...computedToggleButtonProps}
        {...overrideToggleButtonProps}
      >
        <Icon />
      </ToggleButton>
    </div>
  )
}

const ActiveSpeakerWrapper = () => {
  const { localParticipant } = useLocalParticipant()
  const isSpeaking = useIsSpeaking(localParticipant)
  return <ActiveSpeaker isSpeaking={isSpeaking} pushToTalk />
}

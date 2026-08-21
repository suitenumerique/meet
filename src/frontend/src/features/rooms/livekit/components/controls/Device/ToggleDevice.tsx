import { ToggleButton } from '@/primitives'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { useMemo, useRef, useState } from 'react'
import { appendShortcutLabel } from '@/features/shortcuts/utils'
import { useTranslation } from 'react-i18next'
import { PermissionNeededButton } from './PermissionNeededButton'
import useLongPress from '@/features/shortcuts/useLongPress'
import { ActiveSpeaker } from '@/features/rooms/components/ActiveSpeaker'
import {
  useIsSpeaking,
  useMaybeRoomContext,
  useRoomContext,
} from '@livekit/components-react'
import { MediaDeviceFailure } from 'livekit-client'
import { MediaDeviceErrorAlert } from '@/features/rooms/components/MediaDeviceErrorAlert'
import type { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import type { ToggleButtonProps } from '@/primitives/ToggleButton'
import { openPermissionsDialog } from '@/stores/permissions'
import { openSilentMicDialog, silentMicStore } from '@/stores/silentMic'
import { useSnapshot } from 'valtio'
import { useCannotUseDevice } from '../../../hooks/useCannotUseDevice'
import { useDeviceInUse } from '../../../hooks/useDeviceInUse'
import { useDeviceMissing } from '../../../hooks/useDeviceMissing'
import { requestDevicePermission } from '../../../utils/mediaPermissions'
import { useDeviceIcons } from '../../../hooks/useDeviceIcons'
import { useDeviceShortcut } from '../../../hooks/useDeviceShortcut'
import type {
  ToggleSource,
  CaptureOptionsBySource,
} from '@livekit/components-core'
import { getShortcutDescriptorById } from '@/features/shortcuts/catalog'

type ToggleDeviceStyleProps = {
  variant?: NonNullable<ButtonRecipeProps>['variant']
  errorVariant?: NonNullable<ButtonRecipeProps>['variant']
  toggleButtonProps?: Partial<ToggleButtonProps>
}

export type ToggleDeviceProps<T extends ToggleSource> = {
  enabled: boolean
  isDisabled?: boolean
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
  isDisabled,
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
  const deviceMissing = useDeviceMissing(kind)
  const deviceInUse = useDeviceInUse(kind)
  const explainDeviceInUse = deviceInUse && context === 'room'
  const { status: silentMicStatus } = useSnapshot(silentMicStore)
  const silentMicWarning =
    kind === 'audioinput' &&
    silentMicStatus === 'silent' &&
    !cannotUseDevice &&
    !deviceMissing &&
    !deviceInUse
  const deviceShortcut = useDeviceShortcut(kind)
  const announce = useScreenReaderAnnounce()

  const isRequestingPermission = useRef(false)
  const [alertError, setAlertError] = useState<MediaDeviceFailure | null>(null)

  const mediaPath = context === 'join' ? 'join_preview' : 'room'

  const onPress = async () => {
    if (!enabled && deviceMissing) {
      setAlertError(MediaDeviceFailure.NotFound)
      return
    }
    if (!cannotUseDevice && !deviceInUse) {
      toggle()
      return
    }
    if (isRequestingPermission.current) return
    isRequestingPermission.current = true
    try {
      const acquired = await requestDevicePermission(kind, mediaPath)
      if (acquired) {
        toggle()
      } else if (cannotUseDevice) {
        openPermissionsDialog(kind)
      } else if (explainDeviceInUse) {
        setAlertError(MediaDeviceFailure.DeviceInUse)
      }
    } finally {
      isRequestingPermission.current = false
    }
  }

  useRegisterKeyboardShortcut({
    id: deviceShortcut?.id,
    handler: async () => {
      const nextState = !enabled
      try {
        const didChange = await toggle(nextState)
        if (didChange === false) return

        const message = t(nextState ? 'turnedOn' : 'turnedOff', {
          keyPrefix: `selectDevice.${kind}`,
        })
        announce(message, 'assertive')
      } catch {
        // no announce
      }
    },
    isDisabled: cannotUseDevice,
  })

  const pushToTalkShortcut = getShortcutDescriptorById('push-to-talk')
  useLongPress({
    keyCode: kind === 'audioinput' ? pushToTalkShortcut?.code : undefined,
    onKeyDown,
    onKeyUp,
    isDisabled: cannotUseDevice,
  })

  const toggleLabel = useMemo(() => {
    const label = t(enabled ? 'disable' : 'enable', {
      keyPrefix: `selectDevice.${kind}`,
    })
    return deviceShortcut?.shortcut
      ? appendShortcutLabel(label, deviceShortcut.shortcut)
      : label
  }, [enabled, kind, deviceShortcut, t])

  const Icon =
    isDisabled || !enabled ? deviceIcons.toggleOff : deviceIcons.toggleOn

  const roomContext = useMaybeRoomContext()
  if (kind === 'audioinput' && pushToTalk && roomContext) {
    return <ActiveSpeakerWrapper />
  }

  const getToggleTooltip = () => {
    if (deviceMissing) return t(`deviceNotFound.${kind}`)
    if (explainDeviceInUse) return t(`deviceInUse.${kind}`)
    if (cannotUseDevice) return t('tooltip', { keyPrefix: 'permissionsButton' })
    return toggleLabel
  }
  const toggleTooltip = getToggleTooltip()

  return (
    <div style={{ position: 'relative' }}>
      {(cannotUseDevice || deviceMissing) && (
        <PermissionNeededButton
          tooltip={deviceMissing ? t(`deviceNotFound.${kind}`) : undefined}
          onPress={
            deviceMissing
              ? () => setAlertError(MediaDeviceFailure.NotFound)
              : undefined
          }
        />
      )}
      {deviceInUse && (
        <PermissionNeededButton
          tooltip={explainDeviceInUse ? t(`deviceInUse.${kind}`) : null}
          ariaLabel={t(`deviceInUse.${kind}`)}
          onPress={
            explainDeviceInUse
              ? () => setAlertError(MediaDeviceFailure.DeviceInUse)
              : null
          }
        />
      )}
      {silentMicWarning && (
        <PermissionNeededButton
          tooltip={t('tooltip', { keyPrefix: 'silentMic' })}
          onPress={openSilentMicDialog}
        />
      )}
      <ToggleButton
        isSelected={!enabled}
        isDisabled={isDisabled}
        variant={
          isDisabled || cannotUseDevice || !enabled ? errorVariant : variant
        }
        shySelected
        onPress={onPress}
        aria-label={toggleLabel}
        tooltip={toggleTooltip}
        {...computedToggleButtonProps}
        {...overrideToggleButtonProps}
      >
        <Icon />
      </ToggleButton>
      <MediaDeviceErrorAlert
        error={alertError}
        kind={kind}
        onClose={() => setAlertError(null)}
      />
    </div>
  )
}

const ActiveSpeakerWrapper = () => {
  const room = useRoomContext()
  const isSpeaking = useIsSpeaking(room.localParticipant)
  return <ActiveSpeaker isSpeaking={isSpeaking} pushToTalk />
}

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
import { ToggleDeviceConfig } from '../../config/ToggleDeviceConfig'

export type ToggleDeviceProps = {
  enabled: boolean
  isPermissionDeniedOrPrompted?: boolean
  toggle: () => void
  config: ToggleDeviceConfig
  variant?: NonNullable<ButtonRecipeProps>['variant']
  errorVariant?: NonNullable<ButtonRecipeProps>['variant']
  toggleButtonProps?: Partial<ToggleButtonProps>
}

export const ToggleDevice = ({
  config,
  enabled,
  toggle,
  variant = 'primaryDark',
  errorVariant = 'error2',
  toggleButtonProps,
  isPermissionDeniedOrPrompted,
}: ToggleDeviceProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const { kind, shortcut, iconOn, iconOff, longPress } = config

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

  useRegisterKeyboardShortcut({ shortcut, handler: toggle })
  useLongPress({ keyCode: longPress?.key, onKeyDown, onKeyUp })

  const toggleLabel = useMemo(() => {
    const label = t(enabled ? 'disable' : 'enable', {
      keyPrefix: `join.${kind}`,
    })
    return shortcut ? appendShortcutLabel(label, shortcut) : label
  }, [enabled, kind, shortcut, t])

  const Icon = enabled && !isPermissionDeniedOrPrompted ? iconOn : iconOff

  const context = useMaybeRoomContext()
  if (kind === 'audioinput' && pushToTalk && context) {
    return <ActiveSpeakerWrapper />
  }

  return (
    <div style={{ position: 'relative' }}>
      {isPermissionDeniedOrPrompted && <PermissionNeededButton />}
      <ToggleButton
        isSelected={!enabled}
        variant={
          enabled && !isPermissionDeniedOrPrompted ? variant : errorVariant
        }
        shySelected
        onPress={() =>
          isPermissionDeniedOrPrompted ? openPermissionsDialog() : toggle()
        }
        aria-label={toggleLabel}
        tooltip={
          isPermissionDeniedOrPrompted
            ? t('tooltip', { keyPrefix: 'permissionsButton' })
            : toggleLabel
        }
        groupPosition="left"
        {...toggleButtonProps}
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

import { ToggleButton } from '@/primitives'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useMemo, useState } from 'react'
import { appendShortcutLabel } from '@/features/shortcuts/utils'
import { useTranslation } from 'react-i18next'
import useLongPress from '@/features/shortcuts/useLongPress'
import { ActiveSpeaker } from '@/features/rooms/components/ActiveSpeaker'
import {
  useIsSpeaking,
  useLocalParticipant,
  useMaybeRoomContext,
} from '@livekit/components-react'
import { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { SelectToggleDeviceConfig } from '../../types/SelectToggleDevice'
import { css } from '@/styled-system/css'
import { usePermissions } from '@/features/rooms/hooks/usePermissions'
import { useModal } from '@/features/rooms/hooks/useModal'

export type ToggleDeviceProps = {
  enabled: boolean
  toggle: () => void
  config: SelectToggleDeviceConfig
  variant?: NonNullable<ButtonRecipeProps>['variant']
  toggleButtonProps?: Partial<ToggleButtonProps>
}

export const ToggleDevice = ({
  config,
  enabled,
  toggle,
  variant = 'primaryDark',
  toggleButtonProps,
}: ToggleDeviceProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const { open } = useModal('permissions')
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

  const permissions = usePermissions()

  const isPermissionDeniedOrPrompted = useMemo(() => {
    switch (config.kind) {
      case 'audioinput':
        return (
          permissions.isMicrophoneDenied || permissions.isMicrophonePrompted
        )
      case 'videoinput':
        return permissions.isCameraDenied || permissions.isCameraPrompted
    }
  }, [permissions, config.kind])

  useRegisterKeyboardShortcut({ shortcut, handler: toggle })
  useLongPress({ keyCode: longPress?.key, onKeyDown, onKeyUp })

  const isEnabledAndPermitted = enabled && !isPermissionDeniedOrPrompted

  const toggleLabel = useMemo(() => {
    const label = t(isEnabledAndPermitted ? 'disable' : 'enable', {
      keyPrefix: `join.${kind}`,
    })
    return shortcut ? appendShortcutLabel(label, shortcut) : label
  }, [isEnabledAndPermitted, kind, shortcut, t])

  const Icon = isEnabledAndPermitted ? iconOn : iconOff

  const context = useMaybeRoomContext()
  if (kind === 'audioinput' && pushToTalk && context) {
    return <ActiveSpeakerWrapper />
  }

  const errorVariant = variant == 'whiteCircle' ? 'errorCircle' : 'error2'

  return (
    <div
      className={css({
        position: 'relative',
      })}
    >
      <ToggleButton
        isSelected={!enabled}
        variant={isEnabledAndPermitted ? variant : errorVariant}
        shySelected
        onPress={() => (isPermissionDeniedOrPrompted ? open() : toggle())}
        aria-label={toggleLabel}
        tooltip={toggleLabel}
        groupPosition="left"
        {...toggleButtonProps}
      >
        <Icon />
      </ToggleButton>
      {isPermissionDeniedOrPrompted && (
        <span
          className={css({
            position: 'absolute',
            height: '1.25rem',
            width: '1.25rem',
            backgroundColor: 'amber.400',
            top: variant == 'whiteCircle' ? '-1px' : '-5px',
            left: variant == 'whiteCircle' ? '-2px' : '-5px',
            borderRadius: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontWeight: 'bold',
          })}
        >
          !
        </span>
      )}
    </div>
  )
}

const ActiveSpeakerWrapper = () => {
  const { localParticipant } = useLocalParticipant()
  const isSpeaking = useIsSpeaking(localParticipant)
  return <ActiveSpeaker isSpeaking={isSpeaking} pushToTalk />
}

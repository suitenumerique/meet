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

  const Icon = enabled ? iconOn : iconOff

  const context = useMaybeRoomContext()
  if (kind === 'audioinput' && pushToTalk && context) {
    return <ActiveSpeakerWrapper />
  }

  const errorVariant = variant == 'whiteCircle' ? 'errorCircle' : 'error2'

  return (
    <ToggleButton
      isSelected={!enabled}
      variant={enabled ? variant : errorVariant}
      shySelected
      onPress={() => toggle()}
      aria-label={toggleLabel}
      tooltip={toggleLabel}
      groupPosition="left"
      {...toggleButtonProps}
    >
      <Icon />
    </ToggleButton>
  )
}

const ActiveSpeakerWrapper = () => {
  const { localParticipant } = useLocalParticipant()
  const isSpeaking = useIsSpeaking(localParticipant)
  return <ActiveSpeaker isSpeaking={isSpeaking} pushToTalk />
}

import { Participant } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { RiPushpin2Line, RiUnpinLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { useFocusToggleParticipant } from '@/features/rooms/livekit/hooks/useFocusToggleParticipant'

export const PinMenuItem = ({ participant }: { participant: Participant }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu' })

  const { toggle, inFocus } = useFocusToggleParticipant(participant)

  return (
    <MenuItem
      aria-label={t(`${inFocus ? 'unpin' : 'pin'}.ariaLabel`, {
        name: participant.name,
      })}
      className={menuRecipe({ icon: true }).item}
      onAction={toggle}
    >
      <HStack gap={0.25}>
        {inFocus ? (
          <>
            <RiUnpinLine size={20} aria-hidden />
            {t('unpin.label')}
          </>
        ) : (
          <>
            <RiPushpin2Line size={20} aria-hidden />
            {t('pin.label')}
          </>
        )}
      </HStack>
    </MenuItem>
  )
}

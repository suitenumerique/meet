import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { Button } from '@/primitives'
import { RiImageCircleAiFill } from '@remixicon/react'

export const EffectsButton = React.memo(() => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })
  const { isEffectsOpen, toggleEffects } = useSidePanel()
  return (
    <Button
      size={'sm'}
      variant={'primaryTextDark'}
      square
      tooltip={t('effects')}
      onPress={() => !isEffectsOpen && toggleEffects()}
    >
      <RiImageCircleAiFill />
    </Button>
  )
})

EffectsButton.displayName = 'EffectsButton'

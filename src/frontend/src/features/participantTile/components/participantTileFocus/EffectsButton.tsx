import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useEffectsPreload } from '@/features/rooms/livekit/hooks/useEffectsPreload'
import { Button } from '@/primitives'
import { RiImageCircleAiFill } from '@remixicon/react'

export const EffectsButton = React.memo(() => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })
  const { isEffectsOpen, toggleEffects } = useSidePanel()
  const { hoverProps, focusProps } = useEffectsPreload()
  return (
    <Button
      {...hoverProps}
      {...focusProps}
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

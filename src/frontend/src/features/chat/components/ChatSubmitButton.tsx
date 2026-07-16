import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'
import { RiSendPlane2Fill } from '@remixicon/react'

type ChatSubmitButtonProps = {
  handleSubmit: () => Promise<void>
  isDisabled: boolean
}

export const ChatSubmitButton = React.memo(
  ({ handleSubmit, isDisabled }: ChatSubmitButtonProps) => {
    const { t } = useTranslation('rooms', { keyPrefix: 'controls.chat.input' })
    return (
      <Button
        square
        invisible
        variant="tertiaryText"
        size="sm"
        onPress={handleSubmit}
        isDisabled={isDisabled}
        aria-label={t('button.label')}
      >
        <RiSendPlane2Fill />
      </Button>
    )
  }
)

ChatSubmitButton.displayName = 'ChatSubmitButton'

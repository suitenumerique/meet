import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Icon } from '@/primitives'

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
        variant="primary"
        size="sm"
        onPress={handleSubmit}
        isDisabled={isDisabled}
        aria-label={t('button.label')}
      >
        <Icon name="send" size="sm" />
      </Button>
    )
  }
)

ChatSubmitButton.displayName = 'ChatSubmitButton'

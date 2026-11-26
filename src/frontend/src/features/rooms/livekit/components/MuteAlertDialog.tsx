import { useTranslation } from 'react-i18next'
import { Heading } from 'react-aria-components'
import { Button, Dialog, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'

export const MuteAlertDialog = ({
  isOpen,
  onClose,
  onSubmit,
  name,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: () => void
  name: string
}) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'participants.muteParticipantAlert',
  })
  return (
    <Dialog isOpen={isOpen} role="alertdialog" type="alert">
      <Heading
        slot="title"
        level={1}
        className={css({
          fontSize: '1.125rem',
          fontWeight: 'bold',
          lineHeight: '1.5rem',
          marginBottom: '0.375rem',
        })}
      >
        {t('heading', { name })}
      </Heading>
      <Text as="p" variant="smNote" wrap="pretty">
        {t('description', { name })}
      </Text>
      <HStack gap="0.5rem" justify="flex-end" marginTop="1.5rem">
        <Button
          variant="bordered"
          size="sm"
          onPress={onClose}
          className={css({ color: 'content.semantic.neutral.secondary!' })}
        >
          {/* todo - probably make it a proper button variant instead */}
          {t('cancel')}
        </Button>
        <Button variant="primary" size="sm" onPress={onSubmit}>
          {t('confirm')}
        </Button>
      </HStack>
    </Dialog>
  )
}

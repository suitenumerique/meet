import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { Button, Dialog, H, Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { VStack } from '@/styled-system/jsx'
import { connectionRecoveryStore } from '@/stores/connectionRecovery'

export const ConnectionRecoveryDialog = ({
  onLeave,
}: {
  onLeave: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'connectionRecovery' })
  const { isRecovering } = useSnapshot(connectionRecoveryStore)
  return (
    <Dialog
      isOpen={isRecovering}
      role="alertdialog"
      type="alert"
      aria-label={t('title')}
    >
      <VStack>
        <Spinner />
        <H lvl={2} centered>
          {t('title')}
        </H>
        <Text as="p" variant="paragraph" centered>
          {t('body')}
        </Text>
        <Button size="sm" variant="secondary" onPress={onLeave}>
          {t('leave')}
        </Button>
      </VStack>
    </Dialog>
  )
}

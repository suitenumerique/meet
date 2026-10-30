import { useTranslation } from 'react-i18next'
import { RiQuestionLine } from '@remixicon/react'
import { Button } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { useSupportWidget } from '../hooks/useSupportWidget'

export const SupportButton = () => {
  const { t } = useTranslation('global', { keyPrefix: 'support' })
  const { isEnabled, isPending, open } = useSupportWidget()

  if (!isEnabled) return null

  return (
    <Button
      square
      variant="secondaryText"
      aria-label={t('buttonLabel')}
      tooltip={t('buttonLabel')}
      isPending={isPending}
      onPress={open}
    >
      {isPending ? <Spinner size={24} /> : <RiQuestionLine />}
    </Button>
  )
}

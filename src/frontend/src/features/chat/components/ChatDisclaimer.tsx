import { useTranslation } from 'react-i18next'
import { Text } from '@/primitives'
import { styled } from '@/styled-system/jsx'

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    padding: '0.5rem 0.625rem',
    backgroundColor: 'background.semantic.neutral.tertiary',
    borderRadius: 4,
  },
})

export const ChatDisclaimer = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat' })
  return (
    <StyledContainer>
      <Text variant="2xsNote">{t('disclaimer')}</Text>
    </StyledContainer>
  )
}

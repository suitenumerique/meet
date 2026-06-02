import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'

export const StageFrame = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture',
  })
  return (
    <Container role="region" aria-label={t('stage')} {...{ inert: '' }}>
      {children}
    </Container>
  )
}

const Container = styled('div', {
  base: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    marginLeft: '0.5rem',
    marginRight: '0.5rem',
    borderRadius: '4px',
    overflow: 'hidden',
  },
})

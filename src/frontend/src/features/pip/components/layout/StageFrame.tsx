import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'
import { useLocalParticipant } from '@livekit/components-react'

export const StageFrame = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture',
  })
  const { localParticipant } = useLocalParticipant()

  return (
    <Container
      role="region"
      aria-label={t('stage')}
      {...(!localParticipant.isScreenShareEnabled ? { inert: '' } : {})}
    >
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
    padding: '0.5rem',
    boxSizing: 'border-box',
    borderRadius: '4px',
    overflow: 'hidden',
  },
})

import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'
import { useTrackToggle } from '@livekit/components-react'
import { Track } from 'livekit-client'

export const StageFrame = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture',
  })
  const { enabled: isScreenSharing } = useTrackToggle({
    source: Track.Source.ScreenShare,
  })

  return (
    <Container
      role="region"
      aria-label={t('stage')}
      {...(!isScreenSharing ? { inert: '' } : {})}
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

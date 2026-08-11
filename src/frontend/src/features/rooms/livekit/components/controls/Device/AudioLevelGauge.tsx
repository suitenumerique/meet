import { LocalAudioTrack } from 'livekit-client'
import { useTrackVolume } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { RiMicLine, RiMicOffLine } from '@remixicon/react'
import { styled } from '@/styled-system/jsx'
import { Text } from '@/primitives'
import { useIsTrackMuted } from '../../../hooks/useIsTrackMuted'

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 0.25rem',
    marginTop: '0.5rem',
    borderTop: '1px solid',
    minHeight: '2.5rem',
  },
  variants: {
    theme: {
      light: {
        borderColor: 'gray.200',
        color: 'greyscale.600',
      },
      dark: {
        borderColor: 'primaryDark.300',
        color: 'rgba(255 255 255 / 0.7)',
      },
    },
  },
})

const StyledGaugeContainer = styled('div', {
  base: {
    flexGrow: 1,
    height: '0.375rem',
    borderRadius: '0.1875rem',
    overflow: 'hidden',
  },
  variants: {
    theme: {
      light: {
        backgroundColor: 'greyscale.250',
      },
      dark: {
        backgroundColor: 'rgba(255 255 255 / 0.25)',
      },
    },
  },
})

const StyledGauge = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    borderRadius: 'inherit',
    transformOrigin: 'left center',
    transform: 'scaleX(0)',
    transition: 'transform 0.06s linear',
  },
  variants: {
    theme: {
      light: {
        backgroundColor: 'primary.500',
      },
      dark: {
        backgroundColor: 'primaryDark.800',
      },
    },
  },
})

type Theme = 'light' | 'dark'

type AudioLevelGaugeProps = {
  track?: LocalAudioTrack
  variant?: Theme
}

const LevelBar = ({
  track,
  theme,
}: {
  track: LocalAudioTrack
  theme: Theme
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const volume = useTrackVolume(track, {
    fftSize: 256,
    smoothingTimeConstant: 0.7,
  })
  const level = Math.min(1, volume)

  return (
    <>
      <RiMicLine size={18} aria-hidden="true" />
      <StyledGaugeContainer
        theme={theme}
        role="img"
        aria-label={t('audioinput.level')}
      >
        <StyledGauge theme={theme} style={{ transform: `scaleX(${level})` }} />
      </StyledGaugeContainer>
    </>
  )
}

export const AudioLevelGauge = ({
  track,
  variant = 'light',
}: AudioLevelGaugeProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const isMuted = useIsTrackMuted(track)
  const showMutedHint = !track || isMuted

  return (
    <StyledContainer theme={variant}>
      {showMutedHint ? (
        <>
          <RiMicOffLine size={18} aria-hidden="true" />
          <Text variant="bodyXsMedium">{t('audioinput.muteTest')}</Text>
        </>
      ) : (
        <LevelBar
          key={track.mediaStreamTrack?.id}
          track={track}
          theme={variant}
        />
      )}
    </StyledContainer>
  )
}

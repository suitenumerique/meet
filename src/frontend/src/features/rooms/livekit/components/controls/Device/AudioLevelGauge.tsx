import { useEffect, useRef, useState } from 'react'
import {
  createAudioAnalyser,
  LocalAudioTrack,
  TrackEvent,
} from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { RiMicLine, RiMicOffLine } from '@remixicon/react'
import { Text } from '@/primitives'
import { styled } from '@/styled-system/jsx'

const LEVEL_BOOST = 0.8
const DECAY_PER_FRAME = 0.04

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.625rem 0.75rem',
    marginTop: '0.25rem',
    borderTop: '1px solid',
    minHeight: '2.5rem',
  },
  variants: {
    theme: {
      light: {
        borderColor: 'colors.greyscale.250',
        color: 'colors.greyscale.600',
      },
      dark: {
        borderColor: 'rgba(255 255 255 / 0.2)',
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
        backgroundColor: 'rgba(255 255 255 / 0.25)',
      },
      dark: {
        backgroundColor: 'colors.greyscale.250',
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

type AudioLevelGaugeProps = {
  track?: LocalAudioTrack
  variant?: 'light' | 'dark'
}

export const AudioLevelGauge = ({
  track,
  variant = 'light',
}: AudioLevelGaugeProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const fillRef = useRef<HTMLDivElement>(null)

  const [isMuted, setIsMuted] = useState(() => track?.isMuted ?? true)

  useEffect(() => {
    if (!track) {
      setIsMuted(true)
      return
    }
    setIsMuted(track.isMuted)
    const onMuted = () => setIsMuted(true)
    const onUnmuted = () => setIsMuted(false)
    track.on(TrackEvent.Muted, onMuted)
    track.on(TrackEvent.Unmuted, onUnmuted)
    return () => {
      track.off(TrackEvent.Muted, onMuted)
      track.off(TrackEvent.Unmuted, onUnmuted)
    }
  }, [track])

  useEffect(() => {
    if (!track || isMuted || !track.mediaStreamTrack) return

    let rafId: number
    let smoothed = 0
    let calculateVolume: (() => number) | undefined
    let cleanupAnalyser: (() => Promise<void>) | undefined

    const setupAnalyser = () => {
      cleanupAnalyser?.()
      try {
        const analyser = createAudioAnalyser(track, {
          fftSize: 256,
          smoothingTimeConstant: 0.7,
        })
        calculateVolume = analyser.calculateVolume
        cleanupAnalyser = analyser.cleanup
      } catch (e) {
        console.error('Failed to create audio analyser', e)
      }
    }

    setupAnalyser()

    track.on(TrackEvent.Restarted, setupAnalyser)

    const update = () => {
      const volume = calculateVolume?.() ?? 0
      // Fast attack, slow release, like Google Meet.
      smoothed =
        volume > smoothed ? volume : Math.max(0, smoothed - DECAY_PER_FRAME)
      const level = Math.min(1, smoothed * LEVEL_BOOST)
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${level})`
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)

    return () => {
      cancelAnimationFrame(rafId)
      track.off(TrackEvent.Restarted, setupAnalyser)
      cleanupAnalyser?.()
    }
  }, [track, isMuted])

  const showMutedHint = !track || isMuted

  return (
    <StyledContainer theme={variant}>
      {showMutedHint ? (
        <>
          <RiMicOffLine size={18} aria-hidden="true" />
          <Text variant="sm">{t('audioinput.muteTest')}</Text>
        </>
      ) : (
        <>
          <RiMicLine size={18} aria-hidden="true" />
          <StyledGaugeContainer
            role="img"
            aria-label={t('audioinput.level')}
            theme={variant}
          >
            <StyledGauge ref={fillRef} theme={variant} />
          </StyledGaugeContainer>
        </>
      )}
    </StyledContainer>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiVolumeUpLine } from '@remixicon/react'
import { styled } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import { canTestAudioOutput } from '@/features/rooms/utils/canTestAudioOutput'

// Speaker test in the audiooutput menu footer (Meet-style UX). Outputs have
// no track: the test plays a bundled file through the selected sink, and
// following `sinkId` mid-playback re-routes it live. No permission involved.

type Theme = 'light' | 'dark'

const BUTTON_VARIANT = {
  light: 'quaternaryText',
  dark: 'primaryTextDark',
} as const

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    paddingTop: '0.5rem',
    marginTop: '0.5rem',
    borderTop: '1px solid',
  },
  variants: {
    theme: {
      light: {
        borderColor: 'gray.200',
      },
      dark: {
        borderColor: 'primaryDark.300',
      },
    },
  },
})

const StyledButtonContent = styled('span', {
  base: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'full',
    paddingX: '1.625rem',
    '& > svg': {
      position: 'absolute',
      left: 0,
    },
  },
})

type OutputSoundTesterProps = {
  /** The device the test should play through (the select's current key). */
  sinkId?: string
  variant?: Theme
}

export const OutputSoundTester = ({
  sinkId,
  variant = 'light',
}: OutputSoundTesterProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const latestSinkIdRef = useRef(sinkId)
  latestSinkIdRef.current = sinkId

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    if (!sinkId || !canTestAudioOutput()) return
    audioRef.current?.setSinkId(sinkId).catch(() => {
      // Re-routing failed (stale or unplugged device): stop the test rather
      // than keep playing through the previous sink.
      if (latestSinkIdRef.current === sinkId) {
        stopPlayback()
      }
    })
  }, [sinkId, stopPlayback])

  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  return (
    <StyledContainer theme={variant}>
      <Button
        variant={BUTTON_VARIANT[variant]}
        size="sm"
        fullWidth
        isDisabled={isPlaying}
        onPress={async () => {
          const audio = audioRef.current
          if (!audio) return
          try {
            // Confirm routing before starting: a no-op when already routed,
            // but rejects on a stale device id, so the test never plays
            // through the wrong sink.
            if (sinkId && canTestAudioOutput()) {
              await audio.setSinkId(sinkId)
            }
            await audio.play()
            setIsPlaying(true)
          } catch {
            stopPlayback()
          }
        }}
      >
        <StyledButtonContent>
          <RiVolumeUpLine size={18} aria-hidden />
          {isPlaying ? t('audiooutput.testing') : t('audiooutput.test')}
        </StyledButtonContent>
      </Button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src="/sounds/uprise.mp3"
        onEnded={() => setIsPlaying(false)}
      />
    </StyledContainer>
  )
}

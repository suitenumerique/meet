import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiVolumeUpLine } from '@remixicon/react'
import { styled } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import { reportError } from '@/features/analytics/telemetry'
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

  useEffect(() => {
    if (!sinkId || !canTestAudioOutput()) return
    audioRef.current?.setSinkId(sinkId).catch((error) => {
      reportError('device_switch_failure', error, {
        kind: 'audiooutput',
        context: 'test sound setSinkId',
      })
    })
  }, [sinkId])

  return (
    <StyledContainer theme={variant}>
      <Button
        variant={BUTTON_VARIANT[variant]}
        size="sm"
        fullWidth
        isDisabled={isPlaying}
        onPress={() => {
          audioRef.current
            ?.play()
            .then(() => setIsPlaying(true))
            .catch(() => {})
        }}
      >
        <RiVolumeUpLine size={18} aria-hidden />
        {isPlaying ? t('audiooutput.testing') : t('audiooutput.test')}
      </Button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src="sounds/uprise.mp3"
        onEnded={() => setIsPlaying(false)}
      />
    </StyledContainer>
  )
}

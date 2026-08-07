import { Button } from '@/primitives'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { reportError } from '@/features/analytics/telemetry'

export const SoundTester = () => {
  const { t } = useTranslation('settings')
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const { activeDeviceId } = useMediaDeviceSelect({ kind: 'audiooutput' })

  useEffect(() => {
    const updateActiveId = async (deviceId: string) => {
      try {
        await audioRef?.current?.setSinkId(deviceId)
      } catch (error) {
        reportError(
          'device_switch_failure',
          new Error(`Error setting sinkId: ${error}`)
        )
      }
    }
    updateActiveId(activeDeviceId)
  }, [activeDeviceId])

  // prevent pausing the sound
  navigator.mediaSession.setActionHandler('pause', function () {})

  return (
    <>
      <Button
        variant="secondaryText"
        onPress={() => {
          audioRef?.current?.play()
          setIsPlaying(true)
        }}
        size="sm"
        isDisabled={isPlaying}
        fullWidth
        style={{
          color: isPlaying ? 'var(--colors-primary)' : undefined,
        }}
      >
        {isPlaying ? t('audio.speakers.ongoingTest') : t('audio.speakers.test')}
      </Button>
      {/* eslint-disable jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src="sounds/uprise.mp3"
        onEnded={() => setIsPlaying(false)}
      />
    </>
  )
}

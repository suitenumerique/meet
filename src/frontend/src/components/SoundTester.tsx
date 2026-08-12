import { Button } from '@/primitives'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { reportError } from '@/features/analytics/telemetry'
import { canTestAudioOutput } from '@/features/rooms/utils/canTestAudioOutput'

export const SoundTester = () => {
  const { t } = useTranslation('settings')
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const { devices, activeDeviceId } = useMediaDeviceSelect({
    kind: 'audiooutput',
  })

  useEffect(() => {
    if (!canTestAudioOutput() || !activeDeviceId) return
    if (!devices.some((device) => device.deviceId === activeDeviceId)) return
    audioRef.current?.setSinkId(activeDeviceId).catch((error) => {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return
      }
      reportError(
        'device_switch_failure',
        new Error(`Error setting sinkId: ${error}`)
      )
    })
  }, [devices, activeDeviceId])

  // prevent pausing the sound
  navigator.mediaSession.setActionHandler('pause', function () {})

  return (
    <>
      <Button
        variant="secondaryText"
        onPress={async () => {
          try {
            await audioRef?.current?.play()
            setIsPlaying(true)
          } catch {
            setIsPlaying(false)
          }
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
        src="/sounds/uprise.mp3"
        onEnded={() => setIsPlaying(false)}
      />
    </>
  )
}

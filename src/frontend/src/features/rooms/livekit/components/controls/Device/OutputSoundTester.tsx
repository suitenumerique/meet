import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiVolumeUpLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { reportError } from '@/features/analytics/telemetry'
import { canTestAudioOutput } from '@/features/rooms/utils/canTestAudioOutput'

/**
 * Speaker test rendered as the audiooutput menu footer — sibling of
 * AudioLevelGauge for audioinput (Google Meet UX: the test lives inside
 * the device dropdown, the popover stays open while it plays).
 *
 * No track exists for outputs: the test IS playing a bundled file through
 * the selected sink via setSinkId (same mechanism as the settings
 * SoundTester). Needs no permission, so the never-auto-prompt policy
 * holds. Following `sinkId` mid-playback re-routes the sound live, which
 * makes A/B-ing speakers work.
 */

type OutputSoundTesterProps = {
  /** The device the test should play through (the select's current key). */
  sinkId?: string
  variant?: 'light' | 'dark'
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
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        paddingX: '0.75rem',
        paddingY: '0.5rem',
        borderTop: '1px solid',
        borderColor: variant === 'dark' ? 'primaryDark.300' : 'gray.200',
      })}
    >
      <button
        type="button"
        onClick={() => {
          audioRef.current
            ?.play()
            .then(() => setIsPlaying(true))
            .catch(() => {})
        }}
        disabled={isPlaying}
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: 'full',
          cursor: 'pointer',
          fontSize: '0.875rem',
          color: variant === 'dark' ? 'white' : 'control.text',
          _disabled: {
            cursor: 'default',
            color: variant === 'dark' ? 'primaryDark.100' : 'primary',
          },
        })}
      >
        <RiVolumeUpLine size={18} aria-hidden />
        {isPlaying ? t('audiooutput.testing') : t('audiooutput.test')}
      </button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src="sounds/uprise.mp3"
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  )
}

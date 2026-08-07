import { useEffect, useRef, useState } from 'react'
import {
  createAudioAnalyser,
  LocalAudioTrack,
  TrackEvent,
} from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { RiMicLine, RiMicOffLine } from '@remixicon/react'
import { css } from '@/styled-system/css'

/**
 * Boost factor applied to the raw analyser volume so that normal speech
 * animates the indicator visibly (Google Meet style sensitivity).
 */
const LEVEL_BOOST = 1.2

/** How fast the gauge falls back down between words (per frame). */
const DECAY_PER_FRAME = 0.04

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

    // Re-bind the analyser when the underlying MediaStreamTrack is replaced
    // (e.g. after switching to another input device).
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
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.625rem 0.75rem',
        marginTop: '0.25rem',
        borderTop: '1px solid',
        minHeight: '2.5rem',
      })}
      style={{
        borderColor: variant === 'dark' ? 'rgba(255 255 255 / 0.2)' : '#e0e0e0',
        color: variant === 'dark' ? 'rgba(255 255 255 / 0.7)' : '#5f6368',
      }}
    >
      {showMutedHint ? (
        <>
          <RiMicOffLine size={18} aria-hidden="true" />
          <span
            className={css({
              fontSize: '0.875rem',
            })}
          >
            {t('audioinput.muteTest')}
          </span>
        </>
      ) : (
        <>
          <RiMicLine size={18} aria-hidden="true" />
          <div
            role="img"
            aria-label={t('audioinput.level')}
            className={css({
              flexGrow: 1,
              height: '0.375rem',
              borderRadius: '0.1875rem',
              overflow: 'hidden',
            })}
            style={{
              backgroundColor:
                variant === 'dark' ? 'rgba(255 255 255 / 0.25)' : '#e0e0e0',
            }}
          >
            <div
              ref={fillRef}
              className={css({
                width: '100%',
                height: '100%',
                borderRadius: 'inherit',
                transformOrigin: 'left center',
                transform: 'scaleX(0)',
                transition: 'transform 0.06s linear',
              })}
              style={{
                backgroundColor: variant === 'dark' ? '#CACAFB' : '#6A6AF4',
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

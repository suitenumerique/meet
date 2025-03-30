import { LocalVideoTrack, Track } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BackgroundProcessorFactory,
  BackgroundProcessorInterface,
  ProcessorType,
} from '../blur'
import { css } from '@/styled-system/css'
import { Text, P, ToggleButton, H } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import { BackgroundOptions } from '@livekit/track-processors'
import { BlurOn } from '@/components/icons/BlurOn'
import { BlurOnStrong } from '@/components/icons/BlurOnStrong'
import { useTrackToggle } from '@livekit/components-react'
import { Loader } from '@/primitives/Loader'
import { useSyncAfterDelay } from '@/hooks/useSyncAfterDelay'
import { RiProhibited2Line, RiUserVoiceLine } from '@remixicon/react'
import { useHasFaceLandmarksAccess } from '../../hooks/useHasFaceLandmarksAccess'

enum BlurRadius {
  NONE = 0,
  LIGHT = 5,
  NORMAL = 10,
}

const isSupported = BackgroundProcessorFactory.isSupported()

const Information = styled('div', {
  base: {
    backgroundColor: 'orange.50',
    borderRadius: '4px',
    padding: '0.75rem 0.75rem',
    alignItems: 'start',
  },
})

export type EffectsConfigurationProps = {
  videoTrack: LocalVideoTrack
  onSubmit?: (processor?: BackgroundProcessorInterface) => void
  layout?: 'vertical' | 'horizontal'
}

export const EffectsConfiguration = ({
  videoTrack,
  onSubmit,
  layout = 'horizontal',
}: EffectsConfigurationProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { t } = useTranslation('rooms', { keyPrefix: 'effects' })
  const { toggle, enabled } = useTrackToggle({ source: Track.Source.Camera })
  const [processorPending, setProcessorPending] = useState(false)
  const processorPendingReveal = useSyncAfterDelay(processorPending)
  const hasFaceLandmarksAccess = useHasFaceLandmarksAccess()

  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    const attachVideoTrack = async () => videoTrack?.attach(videoElement)
    attachVideoTrack()

    return () => {
      if (!videoElement) return
      videoTrack.detach(videoElement)
    }
  }, [videoTrack, videoTrack?.isMuted])

  const clearEffect = async () => {
    await videoTrack.stopProcessor()
    onSubmit?.(undefined)
  }

  const toggleEffect = async (
    type: ProcessorType,
    options: BackgroundOptions
  ) => {
    setProcessorPending(true)
    if (!videoTrack) {
      /**
       * Special case: if no video track is available, then we must pass directly the processor into the
       * toggle call. Otherwise, the rest of the function below would not have a videoTrack to call
       * setProcessor on.
       *
       * We arrive in this condition when we enter the room with the camera already off.
       */
      const newProcessorTmp = BackgroundProcessorFactory.getProcessor(
        type,
        options
      )!
      await toggle(true, {
        processor: newProcessorTmp,
      })
      setTimeout(() => setProcessorPending(false))
      return
    }

    if (!enabled) {
      await toggle(true)
    }

    const processor = getProcessor()
    try {
      if (isSelected(type, options)) {
        // Stop processor.
        await clearEffect()
      } else if (!processor || processor.serialize().type !== type) {
        // Change processor.
        const newProcessor = BackgroundProcessorFactory.getProcessor(
          type,
          options
        )!
        await videoTrack.setProcessor(newProcessor)
        onSubmit?.(newProcessor)
      } else {
        // Update processor.
        processor?.update(options)
        // We want to trigger onSubmit when options changes so the parent component is aware of it.
        onSubmit?.(processor)
      }
    } catch (error) {
      console.error('Error applying effect:', error)
    } finally {
      // Without setTimeout the DOM is not refreshing when updating the options.
      setTimeout(() => setProcessorPending(false))
    }
  }

  const getProcessor = () => {
    return videoTrack?.getProcessor() as BackgroundProcessorInterface
  }

  const isSelected = (type: ProcessorType, options: BackgroundOptions) => {
    const processor = getProcessor()
    const processorSerialized = processor?.serialize()
    return (
      !!processor &&
      processorSerialized.type === type &&
      JSON.stringify(processorSerialized.options) === JSON.stringify(options)
    )
  }

  const tooltipLabel = (type: ProcessorType, options: BackgroundOptions) => {
    return t(`${type}.${isSelected(type, options) ? 'clear' : 'apply'}`)
  }

  return (
    <div
      className={css(
        layout === 'vertical'
          ? {
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }
          : {
              display: 'flex',
              gap: '1.5rem',
              flexDirection: 'column',
              md: {
                flexDirection: 'row',
                overflow: 'hidden',
              },
            }
      )}
    >
      <div
        className={css({
          width: '100%',
          aspectRatio: 16 / 9,
          position: 'relative',
        })}
      >
        {videoTrack && !videoTrack.isMuted ? (
          <video
            ref={videoRef}
            width="100%"
            muted
            style={{
              transform: 'rotateY(180deg)',
              minHeight: '175px',
              borderRadius: '8px',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              backgroundColor: 'black',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <P
              style={{
                color: 'white',
                textAlign: 'center',
                textWrap: 'balance',
                marginBottom: 0,
              }}
            >
              {t('activateCamera')}
            </P>
          </div>
        )}
        {processorPendingReveal && (
          <div
            className={css({
              position: 'absolute',
              right: '8px',
              bottom: '8px',
            })}
          >
            <Loader />
          </div>
        )}
      </div>
      <div
        className={css(
          layout === 'horizontal'
            ? {
                md: {
                  borderLeft: '1px solid #dadce0',
                  paddingLeft: '1.5rem',
                  width: '420px',
                  flexShrink: 0,
                },
              }
            : {}
        )}
      >
        {isSupported ? (
          <>
            <div>
              <div>
                <H
                  lvl={3}
                  style={{
                    marginBottom: '1rem',
                  }}
                  variant="bodyXsBold"
                >
                  {t('blur.title')}
                </H>
                <div
                  className={css({
                    display: 'flex',
                    gap: '1.25rem',
                  })}
                >
                  <ToggleButton
                    variant="bigSquare"
                    onPress={async () => {
                      await clearEffect()
                    }}
                    isSelected={!getProcessor()}
                    isDisabled={processorPendingReveal}
                  >
                    <RiProhibited2Line />
                  </ToggleButton>
                  <ToggleButton
                    variant="bigSquare"
                    aria-label={tooltipLabel(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.LIGHT,
                    })}
                    tooltip={tooltipLabel(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.LIGHT,
                    })}
                    isDisabled={processorPendingReveal}
                    onChange={async () =>
                      await toggleEffect(ProcessorType.BLUR, {
                        blurRadius: BlurRadius.LIGHT,
                      })
                    }
                    isSelected={isSelected(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.LIGHT,
                    })}
                    data-attr="toggle-blur-light"
                  >
                    <BlurOn />
                  </ToggleButton>
                  <ToggleButton
                    variant="bigSquare"
                    aria-label={tooltipLabel(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.NORMAL,
                    })}
                    tooltip={tooltipLabel(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.NORMAL,
                    })}
                    isDisabled={processorPendingReveal}
                    onChange={async () =>
                      await toggleEffect(ProcessorType.BLUR, {
                        blurRadius: BlurRadius.NORMAL,
                      })
                    }
                    isSelected={isSelected(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.NORMAL,
                    })}
                    data-attr="toggle-blur-normal"
                  >
                    <BlurOnStrong />
                  </ToggleButton>
                </div>
              </div>
              {hasFaceLandmarksAccess && (
                <div
                  className={css({
                    marginTop: '1.5rem',
                  })}
                >
                  <H
                    lvl={3}
                    style={{
                      marginBottom: '1rem',
                    }}
                    variant="bodyXsBold"
                  >
                    {t('faceLandmarks.title')}
                  </H>
                  <div
                    className={css({
                      display: 'flex',
                      gap: '1.25rem',
                    })}
                  >
                    <ToggleButton
                      variant="bigSquare"
                      aria-label={tooltipLabel(ProcessorType.FACE_LANDMARKS, {
                        blurRadius: 0,
                      })}
                      tooltip={tooltipLabel(ProcessorType.FACE_LANDMARKS, {
                        blurRadius: 0,
                      })}
                      isDisabled={processorPendingReveal}
                      onChange={async () =>
                        await toggleEffect(ProcessorType.FACE_LANDMARKS, {
                          blurRadius: 0,
                        })
                      }
                      isSelected={isSelected(ProcessorType.FACE_LANDMARKS, {
                        blurRadius: 0,
                      })}
                      data-attr="toggle-face-landmarks"
                    >
                      <RiUserVoiceLine />
                    </ToggleButton>
                  </div>
                </div>
              )}
              <div
                className={css({
                  marginTop: '1.5rem',
                })}
              >
                <H
                  lvl={3}
                  style={{
                    marginBottom: '1rem',
                  }}
                  variant="bodyXsBold"
                >
                  {t('virtual.title')}
                </H>
                <div
                  className={css({
                    display: 'flex',
                    gap: '1.25rem',
                    flexWrap: 'wrap',
                  })}
                >
                  {[...Array(8).keys()].map((i) => {
                    const imagePath = `/assets/backgrounds/${i + 1}.jpg`
                    const thumbnailPath = `/assets/backgrounds/thumbnails/${i + 1}.jpg`
                    return (
                      <ToggleButton
                        key={i}
                        variant="bigSquare"
                        aria-label={tooltipLabel(ProcessorType.VIRTUAL, {
                          imagePath,
                        })}
                        tooltip={tooltipLabel(ProcessorType.VIRTUAL, {
                          imagePath,
                        })}
                        isDisabled={processorPendingReveal}
                        onChange={async () =>
                          await toggleEffect(ProcessorType.VIRTUAL, {
                            imagePath,
                          })
                        }
                        isSelected={isSelected(ProcessorType.VIRTUAL, {
                          imagePath,
                        })}
                        className={css({
                          bgSize: 'cover',
                        })}
                        style={{
                          backgroundImage: `url(${thumbnailPath})`,
                        }}
                        data-attr={`toggle-virtual-${i}`}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
            <Information className={css({ marginTop: '1rem' })}>
              <Text variant="sm">⚠︎ {t('experimental')}</Text>
            </Information>
          </>
        ) : (
          <Information>
            <Text variant="sm">{t('notAvailable')}</Text>
          </Information>
        )}
      </div>
    </div>
  )
}

import { LocalVideoTrack, Track } from 'livekit-client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BackgroundProcessorFactory,
  BackgroundProcessorInterface,
  ProcessorType,
  BackgroundOptions,
} from '../blur'
import { css } from '@/styled-system/css'
import { Text, P, ToggleButton, H, Button } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import { BlurOn } from '@/components/icons/BlurOn'
import { BlurOnStrong } from '@/components/icons/BlurOnStrong'
import { useTrackToggle } from '@livekit/components-react'
import { RiProhibited2Line } from '@remixicon/react'
import { FunnyEffects } from './FunnyEffects'
import { useHasFunnyEffectsAccess } from '../../hooks/useHasFunnyEffectsAccess'
import { usePermissions } from '@/features/rooms/hooks/usePermissions'
import { useModal } from '@/features/rooms/hooks/useModal'

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

  const { isCameraGranted } = usePermissions()
  const { open } = useModal('permissions')

  const [processorPending, setProcessorPending] = useState(false)

  const hasFunnyEffectsAccess = useHasFunnyEffectsAccess()

  // Note: videoTrack.getProcessor() will return undefined during a transition
  // but our selectedProcessor state maintains the intended value
  const [selectedProcessor, setSelectedProcessor] = useState(
    videoTrack?.getProcessor()
  )

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
    setSelectedProcessor(undefined)
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
      return
    }

    if (!enabled) {
      await toggle(true)
    }

    const processor = videoTrack?.getProcessor() as BackgroundProcessorInterface
    try {
      if (isSelected(type, options)) {
        setSelectedProcessor(undefined)
        // Stop processor.
        await clearEffect()
      } else if (!processor || processor.serialize().type !== type) {
        // Change processor.
        const newProcessor = BackgroundProcessorFactory.getProcessor(
          type,
          options
        )!
        // IMPORTANT: Must explicitly stop previous processor before setting a new one
        // in browsers without modern API support to prevent UI crashes.
        // This workaround is needed until this issue is resolved:
        // https://github.com/livekit/track-processors-js/issues/85
        if (!BackgroundProcessorFactory.hasModernApiSupport()) {
          await videoTrack.stopProcessor()
        }

        await videoTrack.setProcessor(newProcessor)
        setSelectedProcessor(newProcessor)
        onSubmit?.(newProcessor)
      } else {
        // Update processor.
        processor?.update(options)
        // We want to trigger onSubmit when options changes so the parent component is aware of it.
        onSubmit?.(processor)
        setSelectedProcessor(processor)
      }
    } catch (error) {
      console.error('Error applying effect:', error)
    } finally {
      setProcessorPending(false)
    }
  }

  const isSelected = (type: ProcessorType, options: BackgroundOptions) => {
    if (!selectedProcessor) return false
    const processor = selectedProcessor as BackgroundProcessorInterface
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

  const isDisabled = useMemo(
    () => processorPending || videoTrack?.isMuted || !isCameraGranted,
    [processorPending, videoTrack, isCameraGranted]
  )

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
              lg: {
                flexDirection: 'row',
                overflow: 'hidden',
              },
            }
      )}
    >
      <div
        className={css({
          width: '100%',
          position: 'relative',
        })}
      >
        {videoTrack && !videoTrack.isMuted ? (
          <video
            ref={videoRef}
            muted
            className={css(
              layout === 'vertical'
                ? {
                    height: '175px',
                    width: '100%',
                  }
                : {
                    minHeight: '175px',
                    maxWidth: '600px',
                    width: '100%',
                    objectFit: 'cover',
                    sm: {
                      aspectRatio: 16 / 9,
                    },
                    lg: {
                      maxWidth: '100%',
                    },
                  }
            )}
            style={{
              transform: 'rotateY(180deg)',
              borderRadius: '8px',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              backgroundColor: 'black',
              justifyContent: 'center',
              flexDirection: 'column',
              borderRadius: '8px',
            }}
            className={css(
              layout === 'vertical'
                ? {
                    height: '175px',
                    width: '100%',
                  }
                : {
                    minHeight: '175px',
                    maxWidth: '600px',
                    width: '100%',
                    objectFit: 'cover',
                    sm: {
                      aspectRatio: 16 / 9,
                    },
                    lg: {
                      maxWidth: '100%',
                    },
                  }
            )}
          >
            <P
              style={{
                color: 'white',
                textAlign: 'center',
                textWrap: 'balance',
                marginBottom: 0,
              }}
            >
              {t(isCameraGranted ? 'activateCamera' : 'permissionsCamera')}
            </P>
            <Button
              size="sm"
              variant="tertiary"
              onPress={async () => (isCameraGranted ? await toggle() : open())}
              aria-label={t(
                isCameraGranted ? 'activateButton' : 'permissionsButton'
              )}
              className={css({
                width: 'fit-content',
                marginX: 'auto',
                marginTop: '1rem',
              })}
            >
              {t(isCameraGranted ? 'activateButton' : 'permissionsButton')}
            </Button>
          </div>
        )}
      </div>
      <div
        className={css(
          layout === 'horizontal'
            ? {
                md: {
                  borderLeft: '1px solid greyscale.250',
                  paddingLeft: '1.5rem',
                  width: '420px',
                  flexShrink: 0,
                },
              }
            : {}
        )}
      >
        {hasFunnyEffectsAccess && (
          <FunnyEffects
            videoTrack={videoTrack}
            isPending={processorPending}
            onPending={setProcessorPending}
          />
        )}
        {isSupported ? (
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
                  aria-label={t('clear')}
                  onPress={async () => {
                    await clearEffect()
                  }}
                  isSelected={!selectedProcessor}
                  isDisabled={isDisabled}
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
                  isDisabled={isDisabled}
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
                  isDisabled={isDisabled}
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
                        isDisabled={isDisabled}
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
          </div>
        ) : (
          <Information>
            <Text variant="sm">{t('notAvailable')}</Text>
          </Information>
        )}
      </div>
    </div>
  )
}

import { LocalVideoTrack, Track } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BackgroundOptions,
  BackgroundProcessorFactory,
  BackgroundProcessorInterface,
  ProcessorType,
} from '../blur'
import { css } from '@/styled-system/css'
import { H, P, Text, ToggleButton } from '@/primitives'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'
import { styled } from '@/styled-system/jsx'
import { BlurOn } from '@/components/icons/BlurOn'
import { BlurOnStrong } from '@/components/icons/BlurOnStrong'
import { useTrackToggle } from '@livekit/components-react'
import { Loader } from '@/primitives/Loader'
import { useSyncAfterDelay } from '@/hooks/useSyncAfterDelay'
import { FunnyEffects } from './FunnyEffects'
import { useHasFunnyEffectsAccess } from '../../hooks/useHasFunnyEffectsAccess'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { Icon } from '@/primitives/Icon'

enum BlurRadius {
  NONE = 0,
  LIGHT = 5,
  NORMAL = 10,
}

const isSupported = BackgroundProcessorFactory.isSupported()

const MAX_FILE_SIZE_MB = 10

const Information = styled('div', {
  base: {
    backgroundColor: 'orange.50',
    borderRadius: '4px',
    padding: '0.75rem 0.75rem',
    alignItems: 'start',
  },
})

export type EffectsConfigurationProps = {
  isDisabled?: boolean
  videoTrack: LocalVideoTrack
  onSubmit?: (processor?: BackgroundProcessorInterface) => void
  layout?: 'vertical' | 'horizontal'
}

export const EffectsConfiguration = ({
  isDisabled,
  videoTrack,
  onSubmit,
  layout = 'horizontal',
}: EffectsConfigurationProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const blurLightRef = useRef<HTMLButtonElement | null>(null)
  const { t } = useTranslation('rooms', { keyPrefix: 'effects' })
  const { toggle, enabled } = useTrackToggle({ source: Track.Source.Camera })
  const [processorPending, setProcessorPending] = useState(false)
  const processorPendingReveal = useSyncAfterDelay(processorPending)
  const hasFunnyEffectsAccess = useHasFunnyEffectsAccess()
  const announce = useScreenReaderAnnounce()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null)
  const customBackgroundUrlRef = useRef<string | null>(null)
  const effectAnnouncementTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const effectAnnouncementId = useRef(0)

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

  useEffect(() => {
    if (!blurLightRef.current) return

    const rafId = requestAnimationFrame(() => {
      blurLightRef.current?.focus({ preventScroll: true })
    })

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(
    () => () => {
      if (effectAnnouncementTimeout.current) {
        clearTimeout(effectAnnouncementTimeout.current)
      }
      if (customBackgroundUrlRef.current) {
        URL.revokeObjectURL(customBackgroundUrlRef.current)
      }
    },
    []
  )

  const handleCustomBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      console.warn('Selected file is not an image.')
      announce(
        t('virtual.customBackgroundNotAnImage', {
          defaultValue: 'Selected file is not an image. Please select an image file.',
        })
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      console.warn(`Custom background file is too large (max ${MAX_FILE_SIZE_MB} MB).`)
      announce(
        t('virtual.customBackgroundTooLarge', {
          defaultValue: `Selected file is too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
          maxSize: MAX_FILE_SIZE_MB,
        })
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const previousUrl = customBackgroundUrlRef.current
    const newUrl = URL.createObjectURL(file)
    customBackgroundUrlRef.current = newUrl
    await toggleEffect(ProcessorType.VIRTUAL, { imagePath: newUrl })

    const isVirtualSelected =
      typeof isSelected === 'function' ? isSelected(ProcessorType.VIRTUAL, { imagePath: newUrl }) : false

    if (isVirtualSelected) {
      setCustomBackgroundUrl(newUrl)
      if (previousUrl && previousUrl !== newUrl) {
        URL.revokeObjectURL(previousUrl)
      }
    } else {
      URL.revokeObjectURL(newUrl)
      customBackgroundUrlRef.current = previousUrl || null
      setCustomBackgroundUrl(previousUrl || '')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const announceEffectStatusMessage = (message: string) => {
    effectAnnouncementId.current += 1
    const currentId = effectAnnouncementId.current

    if (effectAnnouncementTimeout.current) {
      clearTimeout(effectAnnouncementTimeout.current)
    }

    effectAnnouncementTimeout.current = setTimeout(() => {
      if (currentId !== effectAnnouncementId.current) return
      announce(message)
    }, 80)
  }

  const clearEffect = async () => {
    await videoTrack.stopProcessor()
    onSubmit?.(undefined)
  }

  const getVirtualBackgroundName = (imagePath?: string) => {
    if (!imagePath) return ''
    const match = imagePath.match(/\/backgrounds\/(\d+)\.jpg$/)
    if (!match) return ''
    const index = Number(match[1]) - 1
    if (Number.isNaN(index)) return ''
    return t(`virtual.descriptions.${index}`)
  }

  const updateEffectStatusMessage = (
    type: ProcessorType,
    options: BackgroundOptions,
    wasSelectedBeforeToggle: boolean
  ) => {
    if (wasSelectedBeforeToggle) {
      announceEffectStatusMessage(t('blur.status.none'))
      return
    }

    if (type === ProcessorType.BLUR) {
      const message =
        options.blurRadius === BlurRadius.LIGHT
          ? t('blur.status.light')
          : t('blur.status.strong')
      announceEffectStatusMessage(message)
      return
    }

    if (type === ProcessorType.VIRTUAL) {
      const backgroundName = getVirtualBackgroundName(options.imagePath)
      if (backgroundName) {
        announceEffectStatusMessage(
          `${t('virtual.selectedLabel')} ${backgroundName}`
        )
        return
      }
    }
  }

  const toggleEffect = async (
    type: ProcessorType,
    options: BackgroundOptions
  ) => {
    setProcessorPending(true)
    const wasSelectedBeforeToggle = isSelected(type, options)

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
      if (wasSelectedBeforeToggle) {
        // Stop processor.
        await clearEffect()
      } else if (
        !processor ||
        (processor.serialize().type !== type &&
          !BackgroundProcessorFactory.hasModernApiSupport())
      ) {
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
        onSubmit?.(newProcessor)
      } else {
        await processor?.update(options)
        // We want to trigger onSubmit when options changes so the parent component is aware of it.
        onSubmit?.(processor)
      }

      updateEffectStatusMessage(type, options, wasSelectedBeforeToggle)
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

  const tooltipBlur = (type: ProcessorType, options: BackgroundOptions) => {
    const strength =
      options.blurRadius === BlurRadius.LIGHT ? 'light' : 'normal'
    const action = isSelected(type, options) ? 'clear' : 'apply'

    return t(`${type}.${strength}.${action}`)
  }

  const ariaLabelVirtualBackground = (
    index: number,
    imagePath: string
  ): string => {
    const isSelectedBackground = isSelected(ProcessorType.VIRTUAL, {
      imagePath,
    })
    const prefix = isSelectedBackground ? 'selectedLabel' : 'apply'
    const backgroundName = t(`virtual.descriptions.${index}`)
    return `${t(`virtual.${prefix}`)} ${backgroundName}`
  }

  const tooltipVirtualBackground = (index: number): string => {
    return t(`virtual.descriptions.${index}`)
  }

  const isCustomSelected = !!customBackgroundUrl && isSelected(ProcessorType.VIRTUAL, { imagePath: customBackgroundUrl })

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
          overflow: 'hidden',
          borderRadius: '8px',
        })}
      >
        {videoTrack && !videoTrack.isMuted ? (
          <video
            ref={videoRef}
            width="100%"
            muted
            style={{
              transform: 'rotateY(180deg)',
              [layout === 'vertical' ? 'height' : 'minHeight']: '175px',
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
              {t(isDisabled ? 'cameraDisabled' : 'activateCamera')}
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
            isPending={processorPendingReveal}
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
              <div>
                <div
                  className={css({
                    display: 'flex',
                    gap: '1.25rem',
                  })}
                >
                  <ToggleButton
                    ref={blurLightRef}
                    variant="bigSquare"
                    aria-label={tooltipBlur(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.LIGHT,
                    })}
                    tooltip={tooltipBlur(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.LIGHT,
                    })}
                    isDisabled={processorPendingReveal || isDisabled}
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
                    aria-label={tooltipBlur(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.NORMAL,
                    })}
                    tooltip={tooltipBlur(ProcessorType.BLUR, {
                      blurRadius: BlurRadius.NORMAL,
                    })}
                    isDisabled={processorPendingReveal || isDisabled}
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
                    paddingBottom: '0.5rem',
                    flexWrap: 'wrap',
                  })}
                >
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleCustomBackgroundUpload}
                  />
                  <VisualOnlyTooltip tooltip={t('virtual.customLabel')}>
                    <ToggleButton
                      variant="bigSquare"
                      aria-label={t('virtual.customLabel')}
                      isDisabled={processorPendingReveal || isDisabled}
                      onChange={async () => {
                        if (isCustomSelected) {
                          // Already active, clicking again should disable it (or whatever toggleEffect does when passing same args)
                          await toggleEffect(ProcessorType.VIRTUAL, { imagePath: customBackgroundUrl as string })
                        } else if (customBackgroundUrl) {
                          // Has URL but not active, re-apply it
                          await toggleEffect(ProcessorType.VIRTUAL, { imagePath: customBackgroundUrl })
                        } else {
                          // No URL yet, open file picker
                          fileInputRef.current?.click()
                        }
                      }}
                      isSelected={isCustomSelected}
                      className={css({
                        bgSize: 'cover',
                        backgroundColor: 'greyscale.100',
                      })}
                      style={
                        customBackgroundUrl
                          ? { backgroundImage: `url(${customBackgroundUrl})` }
                          : undefined
                      }
                      data-attr="toggle-virtual-custom"
                    >
                      {!customBackgroundUrl && (
                        <Icon name="add_photo_alternate" type="icons" aria-hidden={true} />
                      )}
                    </ToggleButton>
                  </VisualOnlyTooltip>
                  {[...Array(8).keys()].map((i) => {
                    const imagePath = `/assets/backgrounds/${i + 1}.jpg`
                    const thumbnailPath = `/assets/backgrounds/thumbnails/${i + 1}.jpg`
                    const tooltipText = tooltipVirtualBackground(i)
                    return (
                      <VisualOnlyTooltip key={i} tooltip={tooltipText}>
                        <ToggleButton
                          variant="bigSquare"
                          aria-label={ariaLabelVirtualBackground(i, imagePath)}
                          isDisabled={processorPendingReveal || isDisabled}
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
                      </VisualOnlyTooltip>
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

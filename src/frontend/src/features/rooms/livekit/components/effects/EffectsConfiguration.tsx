import { LocalVideoTrack, Track } from 'livekit-client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BackgroundOptions,
  BackgroundProcessorFactory,
  BackgroundProcessorInterface,
  ProcessorType,
} from '../blur'
import { css } from '@/styled-system/css'
import { Button, Dialog, H, P, Text, ToggleButton } from '@/primitives'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'
import { HStack, styled } from '@/styled-system/jsx'
import { BlurOn } from '@/components/icons/BlurOn'
import { BlurOnStrong } from '@/components/icons/BlurOnStrong'
import { useTrackToggle } from '@livekit/components-react'
import { Loader } from '@/primitives/Loader'
import { useSyncAfterDelay } from '@/hooks/useSyncAfterDelay'
import { FunnyEffects } from './FunnyEffects'
import { useHasFunnyEffectsAccess } from '../../hooks/useHasFunnyEffectsAccess'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import {
  ListFilesParams,
  useListMyFiles,
} from '@/features/files/api/listFiles.ts'
import { useCreateFile } from '@/features/files/api/createFile.ts'
import { FileTrigger } from 'react-aria-components'
import {
  getImageBlobForBackground,
  getImageBlobFromUrlForBackground,
} from '@/features/files/utils/getImageBlobFromUrlForBackground.ts'
import { RiDeleteBinLine, RiImageAddFill } from '@remixicon/react'
import { useDeleteFile } from '@/features/files/api/deleteFile.ts'
import { useUser } from '@/features/auth'
import { ApiFileItem } from '@/features/files/api/types.ts'
import { useConfig } from '@/api/useConfig.ts'

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
  isDisabled?: boolean
  videoTrack: LocalVideoTrack
  onSubmit?: (processor?: BackgroundProcessorInterface) => void
  layout?: 'vertical' | 'horizontal'
}

const listFilesQueryParams: ListFilesParams = {
  filters: {
    type: 'background_image',
    upload_state: 'ready',
    creator_is_me: true,
    is_deleted: false,
  },
  pagination: {
    page: 1,
    pageSize: 20,
  },
}
const LOCAL_IMAGE_KEY = 'local-image'
const LOCAL_IMAGE_RAW_KEY = 'local-image-raw'

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
  const effectAnnouncementTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const effectAnnouncementId = useRef(0)

  const { data: appConfig } = useConfig()
  const { isLoggedIn } = useUser()
  const canUploadBackground =
    isLoggedIn === true &&
    appConfig?.background_image?.upload_is_enabled === true
  // We split the error state in 2 parts so that there are no visual glitches when closing the alert
  const [personalBackgroundHasError, setPersonalBackgroundHasError] =
    useState<boolean>(false)
  const [personalBackgroundError, setPersonalBackgroundError] = useState<
    'file_too_large' | 'invalid_file_type' | null
  >(null)
  const [localSelectedBackground, setLocalSelectedBackground] =
    useState<null | { label: string; previewUrl: string; imagePath: string }>(
      null
    )
  const createFileMutation = useCreateFile()
  const deleteFileMutation = useDeleteFile()
  const filesQ = useListMyFiles(listFilesQueryParams)
  const hasReachedMaxNbBackgrounds =
    (canUploadBackground &&
      appConfig &&
      filesQ.data &&
      filesQ.data.count >= appConfig.background_image.max_count_by_user) ??
    false
  const dataUrlByImageId = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    return () => {
      // We cleanup created URL objects on unmount
      for (const dataUrl of dataUrlByImageId.current.values()) {
        URL.revokeObjectURL(dataUrl)
      }
      dataUrlByImageId.current = new Map()
    }
  }, [])
  const getHandleSelectChangeFile = (file: ApiFileItem) => {
    return async () => {
      // We reuse the previous URL objects if possible
      if (dataUrlByImageId.current.has(file.id)) {
        const dataUrl = dataUrlByImageId.current.get(file.id)!
        await toggleEffect(ProcessorType.VIRTUAL, {
          imagePath: dataUrl,
        })
      } else {
        const imageBlob = await getImageBlobFromUrlForBackground(file.url!)
        const imagePath = URL.createObjectURL(imageBlob)
        dataUrlByImageId.current.set(file.id, imagePath)

        await toggleEffect(ProcessorType.VIRTUAL, {
          imagePath,
        })
      }
    }
  }

  const handleNewBackgroundFilePicked = async (file: File) => {
    if (
      !(
        appConfig?.background_image?.allowed_mimetypes?.includes(file.type) ??
        false
      )
    ) {
      setPersonalBackgroundError('invalid_file_type')
      setPersonalBackgroundHasError(true)
      return
    }
    if (file.size > (appConfig?.background_image?.max_size ?? 0)) {
      setPersonalBackgroundError('file_too_large')
      setPersonalBackgroundHasError(true)
      return
    }

    // When the user is not logged in, we fallback to just loading that image
    if (!canUploadBackground) {
      // For the preview to work, we somehow need to create a data URL from the raw file.
      const rawImageUrl = URL.createObjectURL(file)

      const transformedImageData = await getImageBlobForBackground(file)
      const imagePath = URL.createObjectURL(transformedImageData)

      if (dataUrlByImageId.current.get(LOCAL_IMAGE_KEY)) {
        URL.revokeObjectURL(dataUrlByImageId.current.get(LOCAL_IMAGE_KEY)!)
      }
      if (dataUrlByImageId.current.get(LOCAL_IMAGE_RAW_KEY)) {
        URL.revokeObjectURL(dataUrlByImageId.current.get(LOCAL_IMAGE_RAW_KEY)!)
      }

      dataUrlByImageId.current.set(LOCAL_IMAGE_KEY, imagePath)
      dataUrlByImageId.current.set(LOCAL_IMAGE_RAW_KEY, rawImageUrl)

      await toggleEffect(ProcessorType.VIRTUAL, {
        imagePath,
      })
      setLocalSelectedBackground({
        label: file.name.split('.')[0],
        previewUrl: rawImageUrl,
        imagePath: imagePath,
      })
    } else {
      // Otherwise we create the file in the backend and automatically select it
      // when it's uploaded.
      createFileMutation.mutate(
        {
          file,
          onProgress: (progress) => {
            console.debug('upload-progress', progress)
          },
        },
        {
          onSuccess: (file) => {
            // We automatically select that created file
            getHandleSelectChangeFile(file)()
          },
        }
      )
    }
  }
  const filePickerErrorContext = useMemo(
    () => ({
      allowedExtension: appConfig?.background_image?.allowed_extensions ?? [],
      maxSize: (appConfig?.background_image?.max_size ?? 0) / (1024 * 1024),
    }),
    [appConfig?.background_image]
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
    },
    []
  )

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
    const backgroundName = t(`virtual.presets.descriptions.${index}`)
    return `${t(`virtual.presets.${prefix}`)} ${backgroundName}`
  }

  const tooltipVirtualBackground = (index: number): string => {
    return t(`virtual.descriptions.${index}`)
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
                lvl={2}
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

              <div className={css({ marginTop: '1.5rem' })}>
                <H
                  lvl={2}
                  style={{
                    marginBottom: '0.6rem',
                  }}
                  variant="bodyXsBold"
                >
                  {t('virtual.title')}
                </H>
              </div>

              <div
                className={css({
                  marginBottom: '1rem',
                })}
              >
                <H
                  lvl={2}
                  style={{
                    marginBottom: '0.4rem',
                  }}
                  variant="bodyXsMedium"
                >
                  {t('virtual.personal.title')}
                </H>

                <div
                  className={css({
                    display: 'flex',
                    gap: '1.25rem',
                    paddingBottom: '0.5rem',
                    flexWrap: 'wrap',
                  })}
                >
                  {canUploadBackground &&
                    filesQ.data?.results
                      .filter((file) => file.url)
                      .map((file) => (
                        <div
                          key={file.id}
                          className={
                            'hoverGroup ' + css({ position: 'relative' })
                          }
                        >
                          <VisualOnlyTooltip key={file.id} tooltip={file.title}>
                            <ToggleButton
                              variant="bigSquare"
                              aria-label={file.title}
                              isDisabled={processorPendingReveal || isDisabled}
                              onChange={getHandleSelectChangeFile(file)}
                              isSelected={isSelected(ProcessorType.VIRTUAL, {
                                imagePath:
                                  dataUrlByImageId.current.get(file.id!) ??
                                  file.id!,
                              })}
                              className={css({
                                bgSize: 'cover',
                              })}
                              style={{
                                backgroundImage: `url(${file.url!})`,
                              }}
                              data-attr={`toggle-virtual-${file.id}`}
                            />
                          </VisualOnlyTooltip>
                          <Button
                            className={
                              'hoverGroupChild ' +
                              css({
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                transition: 'opacity 0.2s ease-in-out',
                              })
                            }
                            size={'xs'}
                            variant={'tertiary'}
                            onClick={() =>
                              deleteFileMutation.mutate({ fileId: file.id })
                            }
                            isDisabled={deleteFileMutation.isPending}
                          >
                            <RiDeleteBinLine size={16} />
                          </Button>
                        </div>
                      ))}
                  {!canUploadBackground && localSelectedBackground && (
                    <VisualOnlyTooltip tooltip={localSelectedBackground.label}>
                      <ToggleButton
                        variant="bigSquare"
                        aria-label={localSelectedBackground.label}
                        isDisabled={processorPendingReveal || isDisabled}
                        onChange={() => {
                          toggleEffect(ProcessorType.VIRTUAL, {
                            imagePath: localSelectedBackground.imagePath,
                          })
                        }}
                        isSelected={isSelected(ProcessorType.VIRTUAL, {
                          imagePath: localSelectedBackground.imagePath,
                        })}
                        className={css({
                          bgSize: 'cover',
                        })}
                        style={{
                          backgroundImage: `url(${localSelectedBackground.previewUrl})`,
                        }}
                        data-attr={`toggle-virtual-${LOCAL_IMAGE_KEY}`}
                      />
                    </VisualOnlyTooltip>
                  )}
                  <FileTrigger
                    acceptedFileTypes={
                      appConfig?.background_image?.allowed_mimetypes ?? [
                        'image/png',
                        'image/jpeg',
                      ]
                    }
                    onSelect={(e) => {
                      if (e && e.item(0)) {
                        const file = e.item(0) as File
                        handleNewBackgroundFilePicked(file)
                      }
                    }}
                  >
                    <Button
                      variant="bigSquare"
                      aria-label={t('virtual.personal.selectFileTooltip')}
                      tooltip={t('virtual.personal.selectFileTooltip')}
                      isDisabled={
                        (canUploadBackground &&
                          filesQ.data &&
                          filesQ.data.count >=
                            (appConfig?.background_image?.max_count_by_user ??
                              0)) ||
                        processorPendingReveal ||
                        isDisabled ||
                        createFileMutation.isPending
                      }
                      data-attr="input-file-select-personal-background"
                    >
                      <RiImageAddFill />
                    </Button>
                  </FileTrigger>
                </div>
                {!isLoggedIn && (
                  <Text variant="xsNote">
                    {t('virtual.personal.notLoggedInWarning')}
                  </Text>
                )}
                {!canUploadBackground && isLoggedIn && (
                  <Text variant="xsNote">
                    {t('virtual.personal.warningUploadDisabled')}
                  </Text>
                )}
                {hasReachedMaxNbBackgrounds && (
                  <Text variant="xsNote">
                    {t('virtual.personal.uploadLimitReached')}
                  </Text>
                )}
              </div>
              <div
                className={css({
                  marginTop: '0.4rem',
                })}
              >
                <H
                  lvl={2}
                  style={{
                    marginBottom: '0.4rem',
                  }}
                  variant="bodyXsMedium"
                >
                  {t('virtual.presets.title')}
                </H>
                <div
                  className={css({
                    display: 'flex',
                    gap: '1.25rem',
                    paddingBottom: '0.5rem',
                    flexWrap: 'wrap',
                  })}
                >
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
                          data-attr={`toggle-virtual-preset-${i}`}
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
      <Dialog
        isOpen={personalBackgroundHasError}
        type="alert"
        title={t(`virtual.personal.errors.${personalBackgroundError}.title`)}
        aria-label={t(
          `virtual.personal.errors.${personalBackgroundError}.title`
        )}
        onClose={() => setPersonalBackgroundHasError(false)}
        onOpenChange={() => setPersonalBackgroundHasError(false)}
      >
        <P>
          {t(
            `virtual.personal.errors.${personalBackgroundError}.description`,
            filePickerErrorContext
          )}
        </P>
        <HStack justifyContent="end" direction="row">
          <Button
            variant="text"
            size="sm"
            onPress={() => setPersonalBackgroundHasError(false)}
          >
            {t('virtual.personal.errors.close')}
          </Button>
        </HStack>
      </Dialog>
    </div>
  )
}

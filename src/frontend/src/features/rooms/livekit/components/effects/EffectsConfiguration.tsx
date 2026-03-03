import { LocalVideoTrack, Track } from 'livekit-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BackgroundProcessorFactory,
  BackgroundProcessorInterface,
  ProcessorConfig,
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
import { RiDeleteBinLine, RiImageAddFill } from '@remixicon/react'
import { useDeleteFile } from '@/features/files/api/deleteFile.ts'
import { useUser } from '@/features/auth'
import { ApiFileItem } from '@/features/files/api/types.ts'
import { useConfig } from '@/api/useConfig.ts'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices.ts'
import { proxy, useSnapshot } from 'valtio'

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
  layout?: 'vertical' | 'horizontal'
}

const listFilesQueryParams: ListFilesParams = {
  filters: {
    type: 'background_image',
    upload_state: 'ready',
    is_creator_me: true,
    is_deleted: false,
  },
  pagination: {
    page: 1,
    pageSize: 20,
  },
}

function deriveIdFromProcessorConfig(config: ProcessorConfig) {
  if (config.type === ProcessorType.BLUR) {
    return `blur-${config.blurRadius}`
  } else if (config.type === ProcessorType.VIRTUAL) {
    // the imagePath is not stable for custom backgrounds
    // so we try first with the fileId
    if (config.fileId) {
      return `virtual-${config.fileId}`
    }
    return `virtual-${config.imagePath}`
  } else if (config.type === ProcessorType.FACE_LANDMARKS) {
    return 'face-landmarks'
  }
  throw new Error(`Unknown config type in config: ${config}`)
}

// We use a valtio store so that the state is persisted between the join room
// and the actual room
const uploadNotPossibleLocalState = proxy({
  imageBackgroundConfig: null as null | {
    type: ProcessorType.VIRTUAL
    imagePath: string
    label: string
  },
})

export const EffectsConfiguration = ({
  isDisabled,
  videoTrack,
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

  const {
    saveProcessorConfig,
    userChoices: { processorConfig },
  } = usePersistentUserChoices()

  const selectedId = useMemo(
    () =>
      processorConfig ? deriveIdFromProcessorConfig(processorConfig) : 'none',
    [processorConfig]
  )

  const uploadNotPossibleSnap = useSnapshot(uploadNotPossibleLocalState)

  const announceEffectStatusMessage = useCallback(
    (message: string) => {
      effectAnnouncementId.current += 1
      const currentId = effectAnnouncementId.current

      if (effectAnnouncementTimeout.current) {
        clearTimeout(effectAnnouncementTimeout.current)
      }

      effectAnnouncementTimeout.current = setTimeout(() => {
        if (currentId !== effectAnnouncementId.current) return
        announce(message)
      }, 80)
    },
    [announce]
  )

  const getVirtualBackgroundName = useCallback(
    (imagePath?: string) => {
      if (!imagePath) return ''
      const match = imagePath.match(/\/backgrounds\/(\d+)\.jpg$/)
      if (!match) return ''
      const index = Number(match[1]) - 1
      if (Number.isNaN(index)) return ''
      return t(`virtual.presets.descriptions.${index}`)
    },
    [t]
  )

  const updateEffectStatusMessage = useCallback(
    (config: ProcessorConfig, wasSelectedBeforeToggle: boolean) => {
      if (wasSelectedBeforeToggle) {
        announceEffectStatusMessage(t('blur.status.none'))
        return
      }

      if (config.type === ProcessorType.BLUR) {
        const message =
          config.blurRadius === BlurRadius.LIGHT
            ? t('blur.status.light')
            : t('blur.status.strong')
        announceEffectStatusMessage(message)
        return
      }

      if (config.type === ProcessorType.VIRTUAL) {
        const backgroundName = getVirtualBackgroundName(config.imagePath)
        if (backgroundName) {
          announceEffectStatusMessage(
            `${t('virtual.selectedLabel')} ${backgroundName}`
          )
          return
        }
      }
    },
    [announceEffectStatusMessage, getVirtualBackgroundName, t]
  )

  const toggleEffect = useCallback(
    async (config: ProcessorConfig) => {
      setProcessorPending(true)
      const wasSelectedBeforeToggle =
        selectedId === deriveIdFromProcessorConfig(config)

      if (!videoTrack) {
        /**
         * Special case: if no video track is available, then we must pass directly the processor into the
         * toggle call. Otherwise, the rest of the function below would not have a videoTrack to call
         * setProcessor on.
         *
         * We arrive in this condition when we enter the room with the camera already off.
         */
        const newProcessorTmp = BackgroundProcessorFactory.getProcessor(config)!
        await toggle(true, {
          processor: newProcessorTmp,
        })
        setTimeout(() => setProcessorPending(false))
        return
      }

      if (!enabled) {
        await toggle(true)
      }

      const processor =
        videoTrack?.getProcessor() as BackgroundProcessorInterface
      try {
        if (wasSelectedBeforeToggle) {
          // Stop processor.
          await videoTrack.stopProcessor()
          saveProcessorConfig(undefined)
        } else if (
          !processor ||
          (processor.options.type !== config.type &&
            !BackgroundProcessorFactory.hasModernApiSupport())
        ) {
          // Change processor.
          const newProcessor = BackgroundProcessorFactory.getProcessor(config)!
          // IMPORTANT: Must explicitly stop previous processor before setting a new one
          // in browsers without modern API support to prevent UI crashes.
          // This workaround is needed until this issue is resolved:
          // https://github.com/livekit/track-processors-js/issues/85
          if (!BackgroundProcessorFactory.hasModernApiSupport()) {
            await videoTrack.stopProcessor()
          }
          await videoTrack.setProcessor(newProcessor)
          saveProcessorConfig(config)
        } else {
          await processor?.update(config)
          saveProcessorConfig(config)
        }

        updateEffectStatusMessage(config, wasSelectedBeforeToggle)
      } catch (error) {
        console.error('Error applying effect:', error)
      } finally {
        // Without setTimeout the DOM is not refreshing when updating the options.
        setTimeout(() => setProcessorPending(false))
      }
    },
    [
      enabled,
      saveProcessorConfig,
      selectedId,
      toggle,
      updateEffectStatusMessage,
      videoTrack,
    ]
  )

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
  const createFileMutation = useCreateFile()
  const deleteFileMutation = useDeleteFile()
  const filesQ = useListMyFiles(listFilesQueryParams)
  const hasReachedMaxNbBackgrounds =
    (canUploadBackground &&
      appConfig &&
      filesQ.data &&
      filesQ.data.count >= appConfig.background_image.max_count_by_user) ??
    false

  const getHandleSelectChangeFile = useCallback(
    (file: ApiFileItem) => {
      return async () => {
        await toggleEffect({
          type: ProcessorType.VIRTUAL,
          imagePath: file.url!,
          fileId: file.id,
        })
      }
    },
    [toggleEffect]
  )

  const handleNewBackgroundFilePicked = useCallback(
    async (file: File) => {
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
        // revoking is handled with userChoicesStore
        if (uploadNotPossibleSnap.imageBackgroundConfig) {
          URL.revokeObjectURL(
            uploadNotPossibleSnap.imageBackgroundConfig.imagePath
          )
        }
        const imagePath = URL.createObjectURL(file)

        const fileId = `local-image`
        await toggleEffect({
          type: ProcessorType.VIRTUAL,
          imagePath,
          fileId,
        })
        uploadNotPossibleLocalState.imageBackgroundConfig = {
          type: ProcessorType.VIRTUAL,
          label: file.name.split('.')[0],
          imagePath,
        }
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
    },
    [
      appConfig?.background_image?.allowed_mimetypes,
      appConfig?.background_image?.max_size,
      canUploadBackground,
      createFileMutation,
      getHandleSelectChangeFile,
      toggleEffect,
      uploadNotPossibleSnap.imageBackgroundConfig,
    ]
  )

  const filePickerErrorContext = useMemo(
    () => ({
      allowedExtension: appConfig?.background_image?.allowed_extensions ?? [],
      maxSize: (appConfig?.background_image?.max_size ?? 0) / (1024 * 1024),
    }),
    [appConfig?.background_image]
  )

  const processorOptions = useMemo<{
    isDisabled: boolean
    blurBased: {
      radius: BlurRadius
      Icon: React.FC
      ref?: React.Ref<HTMLButtonElement>
      tooltip: string
      id: string
      config: ProcessorConfig
      isSelected: boolean
    }[]
    virtualBackgrounds: {
      id: string
      config: ProcessorConfig
      isSelected: boolean
      tooltip: string
      ariaLabel: string
      thumbnailPath: string
      index: number
    }[]
    remoteCustomVirtualBackgrounds: {
      id: string
      config: ProcessorConfig
      isSelected: boolean
      tooltip: string
      file: ApiFileItem
    }[]
  }>(() => {
    return {
      isDisabled: (processorPendingReveal || isDisabled) ?? false,
      blurBased: [
        {
          key: 'light',
          radius: BlurRadius.LIGHT,
          icon: BlurOn,
          ref: blurLightRef,
        },
        {
          key: 'normal',
          radius: BlurRadius.NORMAL,
          icon: BlurOnStrong,
          ref: undefined,
        },
      ].map((item) => {
        const config: ProcessorConfig = {
          type: ProcessorType.BLUR,
          blurRadius: item.radius,
        }
        const id = deriveIdFromProcessorConfig(config)
        return {
          id,
          tooltip: t(`blur.light.${selectedId === id ? 'clear' : 'apply'}`),
          radius: item.radius,
          isSelected: selectedId === id,
          Icon: item.icon,
          ref: item.ref,
          config,
        }
      }),
      virtualBackgrounds: [...Array(8).keys()].map((index) => {
        const imagePath = `/assets/backgrounds/${index + 1}.jpg`
        const thumbnailPath = `/assets/backgrounds/thumbnails/${index + 1}.jpg`
        const config: ProcessorConfig = {
          type: ProcessorType.VIRTUAL,
          imagePath,
        }
        const id = deriveIdFromProcessorConfig(config)
        const isSelected = selectedId === id
        const prefix = isSelected ? 'selectedLabel' : 'apply'
        const backgroundName = t(`virtual.presets.descriptions.${index}`)
        const ariaLabel = `${t(`virtual.presets.${prefix}`)} ${backgroundName}`

        return {
          tooltip: backgroundName,
          id,
          config,
          isSelected: selectedId === id,
          thumbnailPath,
          ariaLabel,
          index,
        }
      }),
      remoteCustomVirtualBackgrounds: (filesQ.data?.results ?? [])
        .filter((file) => file.url)
        .map((file) => {
          const config: ProcessorConfig = {
            type: ProcessorType.VIRTUAL,
            imagePath: file.url!,
            fileId: file.id,
          }

          const id = deriveIdFromProcessorConfig(config)

          return {
            tooltip: file.title,
            id,
            config,
            isSelected: selectedId === id,
            file,
          }
        }),
    }
  }, [processorPendingReveal, isDisabled, filesQ.data?.results, t, selectedId])

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
                  {processorOptions.blurBased.map(({ Icon, ...option }) => (
                    <ToggleButton
                      key={option.id}
                      ref={option.ref}
                      variant="bigSquare"
                      aria-label={option.tooltip}
                      tooltip={option.tooltip}
                      isDisabled={processorOptions.isDisabled}
                      onChange={() => toggleEffect(option.config)}
                      isSelected={option.isSelected}
                      data-attr={`toggle-${option.id}`}
                    >
                      <Icon />
                    </ToggleButton>
                  ))}
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
                    processorOptions.remoteCustomVirtualBackgrounds.map(
                      (option) => (
                        <div
                          key={option.id}
                          className={
                            'hoverGroup ' + css({ position: 'relative' })
                          }
                        >
                          <VisualOnlyTooltip tooltip={option.tooltip}>
                            <ToggleButton
                              variant="bigSquare"
                              aria-label={option.tooltip}
                              isDisabled={processorOptions.isDisabled}
                              onChange={getHandleSelectChangeFile(option.file)}
                              isSelected={option.isSelected}
                              className={css({
                                bgSize: 'cover',
                              })}
                              style={{
                                backgroundImage: `url(${option.file.url!})`,
                              }}
                              data-attr={`toggle-virtual-${option.file.id}`}
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
                            onClick={() => {
                              if (option.isSelected) {
                                // we remove the current effect
                                toggleEffect(option.config)
                              }
                              deleteFileMutation.mutate({
                                fileId: option.file.id,
                              })
                            }}
                            isDisabled={deleteFileMutation.isPending}
                          >
                            <RiDeleteBinLine size={16} />
                          </Button>
                        </div>
                      )
                    )}
                  {!canUploadBackground &&
                    uploadNotPossibleSnap.imageBackgroundConfig && (
                      <VisualOnlyTooltip
                        tooltip={
                          uploadNotPossibleSnap.imageBackgroundConfig.label
                        }
                      >
                        <ToggleButton
                          variant="bigSquare"
                          aria-label={
                            uploadNotPossibleSnap.imageBackgroundConfig.label
                          }
                          isDisabled={processorOptions.isDisabled}
                          onChange={() => {
                            toggleEffect(
                              uploadNotPossibleSnap.imageBackgroundConfig!
                            )
                          }}
                          isSelected={
                            deriveIdFromProcessorConfig(
                              uploadNotPossibleSnap.imageBackgroundConfig
                            ) === selectedId
                          }
                          className={css({
                            bgSize: 'cover',
                          })}
                          style={{
                            backgroundImage: `url(${uploadNotPossibleSnap.imageBackgroundConfig.imagePath})`,
                          }}
                          data-attr={`toggle-virtual-local`}
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
                        processorOptions.isDisabled ||
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
                  {processorOptions.virtualBackgrounds.map((option) => (
                    <VisualOnlyTooltip key={option.id} tooltip={option.tooltip}>
                      <ToggleButton
                        variant="bigSquare"
                        aria-label={option.ariaLabel}
                        isDisabled={processorOptions.isDisabled}
                        onChange={() => toggleEffect(option.config)}
                        isSelected={option.isSelected}
                        className={css({
                          bgSize: 'cover',
                        })}
                        style={{
                          backgroundImage: `url(${option.thumbnailPath})`,
                        }}
                        data-attr={`toggle-virtual-preset-${option.index}`}
                      />
                    </VisualOnlyTooltip>
                  ))}
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

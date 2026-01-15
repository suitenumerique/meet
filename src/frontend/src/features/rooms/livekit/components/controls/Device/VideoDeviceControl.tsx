import { useTranslation } from 'react-i18next'
import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { Button, Popover } from '@/primitives'
import { RiArrowUpSLine, RiImageCircleAiFill } from '@remixicon/react'
import { Track, VideoCaptureOptions } from 'livekit-client'

import { ToggleDevice } from './ToggleDevice'
import { css } from '@/styled-system/css'
import { usePersistentUserChoices } from '../../../hooks/usePersistentUserChoices'
import { useCanPublishTrack } from '../../../hooks/useCanPublishTrack'
import { useCannotUseDevice } from '../../../hooks/useCannotUseDevice'
import { useSidePanel } from '../../../hooks/useSidePanel'
import { useSidePanelTriggers } from '../../../hooks/useSidePanelTriggers'
import { BackgroundProcessorFactory } from '../../blur'
import Source = Track.Source
import * as React from 'react'
import { SelectDevice } from './SelectDevice'
import { SettingsButton } from './SettingsButton'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { TrackSource } from '@livekit/protocol'
import { useFocusOnOpen } from '@/hooks/useFocusOnOpen'

const EffectsButton = ({ onPress }: { onPress: () => void }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const { isEffectsOpen, toggleEffects } = useSidePanel()
  const { setTrigger } = useSidePanelTriggers()
  return (
    <Button
      size="sm"
      square
      tooltip={t('effects')}
      aria-label={t('effects')}
      variant="primaryDark"
      ref={(el) => setTrigger('effects', el)}
      onPress={() => {
        if (!isEffectsOpen) toggleEffects()
        onPress()
      }}
    >
      <RiImageCircleAiFill size={24} />
    </Button>
  )
}

type VideoDeviceControlProps = Omit<
  UseTrackToggleProps<Source.Camera>,
  'source' | 'onChange'
> & {
  hideMenu?: boolean
}

export const VideoDeviceControl = ({
  hideMenu,
  ...props
}: VideoDeviceControlProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const popoverContentRef = React.useRef<HTMLDivElement>(null)
  const { setTrigger } = useSidePanelTriggers()

  const { userChoices, saveVideoInputDeviceId, saveVideoInputEnabled } =
    usePersistentUserChoices()

  const onChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) =>
      isUserInitiated ? saveVideoInputEnabled(enabled) : null,
    [saveVideoInputEnabled]
  )

  const trackProps = useTrackToggle({
    source: Source.Camera,
    onChange,
    ...props,
  })

  const kind = 'videoinput'
  const cannotUseDevice = useCannotUseDevice(kind)

  const toggleWithProcessor = async () => {
    /**
     * We need to make sure that we apply the in-memory processor when re-enabling the camera.
     * Before, we had the following bug:
     * 1 - Configure a processor on join screen
     * 2 - Turn off camera on join screen
     * 3 - Join the room
     * 4 - Turn on the camera
     * 5 - No processor is applied to the camera
     * Expected: The processor is applied.
     *
     * See https://github.com/numerique-gouv/meet/pull/309#issuecomment-2622404121
     */
    const processor = BackgroundProcessorFactory.deserializeProcessor(
      userChoices.processorSerialized
    )

    const toggle = trackProps.toggle as (
      forceState: boolean,
      captureOptions: VideoCaptureOptions
    ) => Promise<void>

    await toggle(!trackProps.enabled, {
      processor: processor,
    } as VideoCaptureOptions)
  }

  const selectLabel = t(`settings.${SettingsDialogExtendedKey.VIDEO}`)
  const canPublishTrack = useCanPublishTrack(TrackSource.CAMERA)

  useFocusOnOpen(isMenuOpen, popoverContentRef, {
    selector:
      '[data-attr="video-input-select"] button, [data-attr="video-input-select"] [role="combobox"]',
    delayMs: 250,
  })

  return (
    <div
      className={css({
        display: 'flex',
        gap: '1px',
      })}
    >
      <ToggleDevice
        {...trackProps}
        isDisabled={!canPublishTrack}
        kind={kind}
        toggle={toggleWithProcessor}
        overrideToggleButtonProps={{
          ...(hideMenu
            ? {
                groupPosition: undefined,
              }
            : {}),
        }}
      />
      {!hideMenu && (
        <Popover
          variant="dark"
          withArrow={false}
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
        >
          <Button
            tooltip={selectLabel}
            aria-label={selectLabel}
            groupPosition="right"
            square
            ref={(el) => setTrigger('cameraMenu', el)}
            variant={
              !canPublishTrack || !trackProps.enabled || cannotUseDevice
                ? 'error2'
                : 'primaryDark'
            }
          >
            <RiArrowUpSLine />
          </Button>
          {({ close }) => (
            <div
              ref={popoverContentRef}
              className={css({
                maxWidth: '36rem',
                padding: '0.15rem',
                display: 'flex',
                gap: '0.5rem',
              })}
            >
              <div
                data-attr="video-input-select"
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                }}
              >
                <SelectDevice
                  context="room"
                  kind={kind}
                  id={userChoices.videoDeviceId}
                  onSubmit={saveVideoInputDeviceId}
                />
              </div>
              <EffectsButton onPress={close} />
              <SettingsButton
                settingTab={SettingsDialogExtendedKey.VIDEO}
                onPress={close}
              />
            </div>
          )}
        </Popover>
      )}
    </div>
  )
}

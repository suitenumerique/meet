import { useTranslation } from 'react-i18next'
import {
  useMediaDeviceSelect,
  useTrackToggle,
  UseTrackToggleProps,
} from '@livekit/components-react'
import { Button, Menu, MenuList } from '@/primitives'
import { RiArrowUpSLine } from '@remixicon/react'
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Track,
  VideoCaptureOptions,
} from 'livekit-client'

import { ToggleDevice } from './ToggleDevice'
import { css } from '@/styled-system/css'
import { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { useEffect } from 'react'
import { usePersistentUserChoices } from '../../hooks/usePersistentUserChoices'
import { BackgroundProcessorFactory } from '../blur'
import {
  SelectToggleSource,
  ToggleSource,
} from '../../types/SelectToggleDevice'
import { SELECT_TOGGLE_DEVICE_CONFIG } from '../../config/SelectToggleDevice'

export type SelectToggleDeviceProps<T extends ToggleSource> =
  UseTrackToggleProps<T> & {
    track?: LocalAudioTrack | LocalVideoTrack | undefined
    initialDeviceId?: string
    onActiveDeviceChange: (deviceId: string) => void
    source: SelectToggleSource
    variant?: NonNullable<ButtonRecipeProps>['variant']
    menuVariant?: 'dark' | 'light'
    hideMenu?: boolean
  }

export const SelectToggleDevice = <T extends ToggleSource>({
  track,
  initialDeviceId,
  onActiveDeviceChange,
  hideMenu,
  variant = 'primaryDark',
  menuVariant = 'light',
  ...props
}: SelectToggleDeviceProps<T>) => {
  const config = SELECT_TOGGLE_DEVICE_CONFIG[props.source]
  if (!config) {
    throw new Error('Invalid source')
  }
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })
  const trackProps = useTrackToggle(props)

  const { userChoices } = usePersistentUserChoices()

  const toggle = () => {
    if (props.source === Track.Source.Camera) {
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

      toggle(!trackProps.enabled, {
        processor: processor,
      } as VideoCaptureOptions)
    } else {
      trackProps.toggle()
    }
  }

  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind: config.kind, track })

  /**
   * When providing only track outside of a room context, activeDeviceId is undefined.
   * So we need to initialize it with the initialDeviceId.
   * nb: I don't understand why useMediaDeviceSelect cannot infer it from track device id.
   */
  useEffect(() => {
    if (initialDeviceId !== undefined) {
      setActiveMediaDevice(initialDeviceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveMediaDevice])

  const selectLabel = t('choose', { keyPrefix: `join.${config.kind}` })

  return (
    <div
      className={css({
        display: 'flex',
        gap: '1px',
      })}
    >
      <ToggleDevice
        {...trackProps}
        config={config}
        variant={variant}
        toggle={toggle}
        toggleButtonProps={{
          ...(hideMenu
            ? {
                groupPosition: undefined,
              }
            : {}),
        }}
      />
      {!hideMenu && (
        <Menu variant={menuVariant}>
          <Button
            tooltip={selectLabel}
            aria-label={selectLabel}
            groupPosition="right"
            square
            variant={trackProps.enabled ? variant : 'error2'}
          >
            <RiArrowUpSLine />
          </Button>
          <MenuList
            items={devices.map((d) => ({
              value: d.deviceId,
              label: d.label,
            }))}
            selectedItem={activeDeviceId}
            onAction={(value) => {
              setActiveMediaDevice(value as string)
              onActiveDeviceChange(value as string)
            }}
            variant={menuVariant}
          />
        </Menu>
      )}
    </div>
  )
}

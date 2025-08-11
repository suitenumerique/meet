import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { ToggleDevice as BaseToggleDevice } from '../../livekit/components/controls/ToggleDevice'
import {
  TOGGLE_DEVICE_CONFIG,
  ToggleSource,
} from '../../livekit/config/ToggleDeviceConfig'
import { LocalAudioTrack, LocalVideoTrack } from 'livekit-client'
import { ButtonRecipeProps } from '@/primitives/buttonRecipe'

type ToggleDeviceProps<T extends ToggleSource> = UseTrackToggleProps<T> & {
  track?: LocalAudioTrack | LocalVideoTrack | undefined
  source: ToggleSource
  variant?: NonNullable<ButtonRecipeProps>['variant']
}

export const ToggleDevice = <T extends ToggleSource>(
  props: ToggleDeviceProps<T>
) => {
  const config = TOGGLE_DEVICE_CONFIG[props.source]

  if (!config) {
    throw new Error('Invalid source')
  }

  const trackProps = useTrackToggle(props)

  return (
    <BaseToggleDevice
      {...trackProps}
      config={config}
      variant="whiteCircle"
      errorVariant="errorCircle"
      toggleButtonProps={{
        groupPosition: undefined,
      }}
    />
  )
}

import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { SelectToggleDeviceProps } from '@/features/rooms/livekit/components/controls/SelectToggleDevice'
import { ToggleDevice } from '@/features/rooms/livekit/components/controls/ToggleDevice'
import {
  SelectToggleSource,
  ToggleSource,
} from '@/features/rooms/livekit/types/SelectToggleDevice'
import { SELECT_TOGGLE_DEVICE_CONFIG } from '@/features/rooms/livekit/config/SelectToggleDevice'

type ToggleDeviceJoinProps<T extends ToggleSource> = UseTrackToggleProps<T> &
  Pick<SelectToggleDeviceProps<T>, 'track' | 'source' | 'variant'>

export const ToggleDeviceJoin = <T extends ToggleSource>(
  props: ToggleDeviceJoinProps<T>
) => {
  const config = SELECT_TOGGLE_DEVICE_CONFIG[props.source as SelectToggleSource]
  if (!config) {
    throw new Error('Invalid source')
  }

  const trackProps = useTrackToggle(props)

  return (
    <ToggleDevice
      {...trackProps}
      config={config}
      variant="whiteCircle"
      toggleButtonProps={{
        groupPosition: undefined,
      }}
    />
  )
}

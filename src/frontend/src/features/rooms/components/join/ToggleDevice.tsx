import { UseTrackToggleProps } from '@livekit/components-react'
import { ToggleDevice as BaseToggleDevice } from '../../livekit/components/controls/Device/ToggleDevice'
import { LocalAudioTrack, LocalVideoTrack, Track } from 'livekit-client'
import { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { useCallback, useState } from 'react'

type ToggleSource = Exclude<
  Track.Source,
  | Track.Source.ScreenShareAudio
  | Track.Source.Unknown
  | Track.Source.ScreenShare
>

type ToggleDeviceProps<T extends ToggleSource> = Pick<
  UseTrackToggleProps<T>,
  'onChange' | 'initialState'
> & {
  track?: LocalAudioTrack | LocalVideoTrack
  kind: MediaDeviceKind
  variant?: NonNullable<ButtonRecipeProps>['variant']
}

export const ToggleDevice = <T extends ToggleSource>({
  track,
  kind,
  onChange,
  initialState,
}: ToggleDeviceProps<T>) => {
  const [isTrackEnabled, setIsTrackEnabled] = useState(initialState ?? false)

  const toggle = useCallback(async () => {
    try {
      if (isTrackEnabled) {
        setIsTrackEnabled(false)
        onChange?.(false, true)
        await track?.mute()
      } else {
        setIsTrackEnabled(true)
        onChange?.(true, true)
        await track?.unmute()
      }
    } catch (error) {
      console.error('Failed to toggle track:', error)
    }
  }, [track, onChange, isTrackEnabled])

  return (
    <BaseToggleDevice
      enabled={isTrackEnabled}
      toggle={toggle}
      kind={kind}
      variant="whiteCircle"
      errorVariant="errorCircle"
      toggleButtonProps={{
        groupPosition: undefined,
      }}
    />
  )
}

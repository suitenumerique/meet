import { UseTrackToggleProps } from '@livekit/components-react'
import { ToggleDevice as BaseToggleDevice } from '../../livekit/components/controls/ToggleDevice'
import {
  TOGGLE_DEVICE_CONFIG,
  ToggleSource,
} from '../../livekit/config/ToggleDeviceConfig'
import { LocalAudioTrack, LocalVideoTrack } from 'livekit-client'
import { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { useCallback, useMemo, useState } from 'react'
import { useSnapshot } from 'valtio'
import { permissionsStore } from '@/stores/permissions'

type ToggleDeviceProps<T extends ToggleSource> = UseTrackToggleProps<T> & {
  track?: LocalAudioTrack | LocalVideoTrack
  source: ToggleSource
  variant?: NonNullable<ButtonRecipeProps>['variant']
}

export const ToggleDevice = <T extends ToggleSource>({
  track,
  onChange,
  ...props
}: ToggleDeviceProps<T>) => {
  const config = TOGGLE_DEVICE_CONFIG[props.source]

  if (!config) {
    throw new Error('Invalid source')
  }

  const [isTrackEnabled, setIsTrackEnabled] = useState(
    props.initialState ?? false
  )

  const permissions = useSnapshot(permissionsStore)

  const isPermissionDeniedOrPrompted = useMemo(() => {
    if (config.kind == 'audioinput') {
      return permissions.isMicrophoneDenied || permissions.isMicrophonePrompted
    }
    if (config.kind == 'videoinput') {
      return permissions.isCameraDenied || permissions.isCameraPrompted
    }
  }, [config, permissions])

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
      isPermissionDeniedOrPrompted={isPermissionDeniedOrPrompted}
      toggle={toggle}
      config={config}
      variant="whiteCircle"
      errorVariant="errorCircle"
      toggleButtonProps={{
        groupPosition: undefined,
      }}
    />
  )
}

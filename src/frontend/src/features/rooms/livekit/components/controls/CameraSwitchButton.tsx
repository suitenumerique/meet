import { Button } from '@/primitives'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { RiCameraSwitchLine } from '@remixicon/react'
import { useEffect, useState } from 'react'
import type { ButtonProps } from 'react-aria-components'
import { useTranslation } from 'react-i18next'

enum FacingMode {
  USER = 'user',
  ENVIRONMENT = 'environment',
}

export const CameraSwitchButton = (props: Partial<ButtonProps>) => {
  const { t } = useTranslation('rooms')

  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({
      kind: 'videoinput',
      requestPermissions: true,
    })

  // getCapabilities type is not available.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDeviceFacingMode = (device: any): string[] => {
    if (!device.getCapabilities) {
      return []
    }
    const capabilities = device.getCapabilities()
    if (!capabilities) {
      return []
    }
    if (typeof capabilities.facingMode !== 'object') {
      return []
    }
    return capabilities.facingMode
  }

  const detectCurrentFacingMode = (): FacingMode | null => {
    if (!activeDeviceId) {
      return null
    }
    const activeDevice = devices.find(
      (device) => device.deviceId === activeDeviceId
    )
    if (!activeDevice) {
      return null
    }
    const facingMode = getDeviceFacingMode(activeDevice)
    if (facingMode.indexOf(FacingMode.USER) >= 0) {
      return FacingMode.USER
    }
    if (facingMode.indexOf(FacingMode.ENVIRONMENT) >= 0) {
      return FacingMode.ENVIRONMENT
    }
    return null
  }

  const guessCurrentFacingMode = () => {
    const facingMode = detectCurrentFacingMode()
    if (facingMode) {
      return facingMode
    }
    // We consider by default if we have no clue that the user camera is used.
    return FacingMode.USER
  }

  const [facingMode, setFacingMode] = useState<FacingMode | null>()

  /**
   * Before setting the initial value of facingMode we need to wait for devices to
   * be loaded ( because in detectCurrentFacingMode we need to find the active device
   * in the devices list ), which is not the case at first render.
   */
  useEffect(() => {
    if (devices.length == 0) {
      return
    }
    if (facingMode) {
      return
    }

    setFacingMode(guessCurrentFacingMode())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices])

  const getUserDevice = (
    facingMode: FacingMode
  ): MediaDeviceInfo | undefined => {
    return devices.find((device) => {
      return getDeviceFacingMode(device).indexOf(facingMode) >= 0
    })
  }

  const toggle = () => {
    let target: FacingMode
    if (facingMode === FacingMode.USER) {
      target = FacingMode.ENVIRONMENT
    } else {
      target = FacingMode.USER
    }
    const device = getUserDevice(target)
    if (device) {
      setActiveMediaDevice(device.deviceId)
      setFacingMode(target)
    } else {
      console.error('Cannot get user device with facingMode ' + target)
    }
  }
  return (
    <Button
      onPress={(e) => {
        toggle()
        props.onPress?.(e)
      }}
      variant="primaryTextDark"
      aria-label={t('options.items.switchCamera')}
      tooltip={t('options.items.switchCamera')}
      description={true}
    >
      <RiCameraSwitchLine size={20} />
    </Button>
  )
}

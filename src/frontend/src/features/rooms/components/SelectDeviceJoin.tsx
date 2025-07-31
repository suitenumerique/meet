import {
  RemixiconComponentType,
  RiMicLine,
  RiVideoOnLine,
  RiVolumeDownLine,
} from '@remixicon/react'
import { Select } from '@/primitives/Select.tsx'
import { useMemo } from 'react'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '@/features/rooms/hooks/usePermissions'

type DeviceItems = Array<{ value: string; label: string }>

type DeviceConfig = {
  icon: RemixiconComponentType
  isGranted: boolean
}

type SelectDeviceJoinProps = {
  id?: string
  onSubmit?: (id: string) => void
  kind: MediaDeviceKind
}

export const SelectDeviceJoin = ({ kind, ...props }: SelectDeviceJoinProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })
  const { isMicrophoneGranted, isCameraGranted } = usePermissions()

  const config = useMemo<DeviceConfig>(() => {
    switch (kind) {
      case 'audioinput':
        return {
          icon: RiMicLine,
          isGranted: isMicrophoneGranted,
        }
      case 'audiooutput':
        return {
          icon: RiVolumeDownLine,
          isGranted: isMicrophoneGranted,
        }
      case 'videoinput':
        return {
          icon: RiVideoOnLine,
          isGranted: isCameraGranted,
        }
    }
  }, [kind, isMicrophoneGranted, isCameraGranted])

  if (!config.isGranted) {
    return (
      <Select
        aria-label={'selector disabled - permissions are needed'}
        label=""
        items={[]}
        isDisabled={true}
        iconComponent={config.icon}
        placeholder={t('selectDevice.permissionNeeded')}
      />
    )
  }

  return <SelectDeviceJoinActive {...props} kind={kind} config={config} />
}

type SelectDeviceJoinActiveProps = {
  config: DeviceConfig
} & SelectDeviceJoinProps

const SelectDeviceJoinActive = ({
  id,
  onSubmit,
  kind,
  config,
}: SelectDeviceJoinActiveProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const getDefaultSelectedKey = (items: DeviceItems) => {
    if (!items || items.length === 0) return
    const defaultItem =
      items.find((item) => item.value === 'default') || items[0]
    return defaultItem.value
  }

  const {
    devices: devices,
    activeDeviceId: activeDeviceId,
    setActiveMediaDevice: setActiveMediaDevice,
  } = useMediaDeviceSelect({ kind, requestPermissions: false })

  const items: DeviceItems = devices
    .filter((d) => !!d.deviceId)
    .map((d) => ({
      value: d.deviceId,
      label: d.label,
    }))

  return (
    <Select
      aria-label={t(`${kind}.choose`)}
      label=""
      isDisabled={items.length == 0}
      items={items}
      iconComponent={config?.icon}
      placeholder={t('selectDevice.loading')}
      defaultSelectedKey={id || activeDeviceId || getDefaultSelectedKey(items)}
      onSelectionChange={(key) => {
        onSubmit?.(key as string)
        setActiveMediaDevice(key as string)
      }}
    />
  )
}

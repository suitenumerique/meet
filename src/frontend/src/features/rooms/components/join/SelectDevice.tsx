import {
  RemixiconComponentType,
  RiMicLine,
  RiVideoOnLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useMemo } from 'react'
import { Select } from '@/primitives/Select'

type DeviceItems = Array<{ value: string; label: string }>

type DeviceConfig = {
  icon: RemixiconComponentType
}

type SelectDeviceProps = {
  id?: string
  onSubmit?: (id: string) => void
  kind: MediaDeviceKind
}

export const SelectDevice = ({ id, onSubmit, kind }: SelectDeviceProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const config = useMemo<DeviceConfig | undefined>(() => {
    switch (kind) {
      case 'audioinput':
        return {
          icon: RiMicLine,
        }
      case 'videoinput':
        return {
          icon: RiVideoOnLine,
        }
    }
  }, [kind])

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
      isDisabled={items.length === 0}
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

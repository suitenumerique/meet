import { RiMicLine, RiVideoOnLine, RiVolumeDownLine } from '@remixicon/react'
import { Select } from '@/primitives/Select.tsx'
import { useMemo } from 'react'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'

type DeviceItems = Array<{ value: string; label: string }>

export const SelectDeviceJoin = ({
  id,
  onSubmit,
  kind,
}: {
  id?: string
  onSubmit?: (id: string) => void
  kind: MediaDeviceKind
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const config = useMemo(() => {
    switch (kind) {
      case 'audioinput':
        return {
          icon: RiMicLine,
        }
      case 'audiooutput':
        return {
          icon: RiVolumeDownLine,
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

  const items: DeviceItems = devices.map((d) => ({
    value: d.deviceId,
    label: d.label,
  }))

  return (
    <Select
      aria-label={t(`${kind}.choose`)}
      label=""
      items={items}
      iconComponent={config.icon}
      placeholder={t('selectDevice.loading')}
      defaultSelectedKey={id || activeDeviceId || getDefaultSelectedKey(items)}
      onSelectionChange={(key) => {
        onSubmit?.(key as string)
        setActiveMediaDevice(key as string)
      }}
    />
  )
}

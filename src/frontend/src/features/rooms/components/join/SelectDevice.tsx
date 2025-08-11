import {
  RemixiconComponentType,
  RiMicLine,
  RiVideoOnLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useMemo } from 'react'
import { Select } from '@/primitives/Select'
import { useSnapshot } from 'valtio'
import { permissionsStore } from '@/stores/permissions'

type DeviceItems = Array<{ value: string; label: string }>

type DeviceConfig = {
  icon: RemixiconComponentType
}

type SelectDeviceProps = {
  id?: string
  onSubmit?: (id: string) => void
  kind: MediaDeviceKind
}

type SelectDevicePermissionsProps = SelectDeviceProps & {
  config: DeviceConfig
}

const SelectDevicePermissions = ({
  id,
  kind,
  config,
  onSubmit,
}: SelectDevicePermissionsProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind: kind, requestPermissions: true })

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
      selectedKey={id || activeDeviceId}
      onSelectionChange={(key) => {
        onSubmit?.(key as string)
        setActiveMediaDevice(key as string)
      }}
    />
  )
}

export const SelectDevice = ({ id, onSubmit, kind }: SelectDeviceProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const permissions = useSnapshot(permissionsStore)

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

  const isPermissionDeniedOrPrompted = useMemo(() => {
    if (kind == 'audioinput') {
      return permissions.isMicrophoneDenied || permissions.isMicrophonePrompted
    }
    if (kind == 'videoinput') {
      return permissions.isCameraDenied || permissions.isCameraPrompted
    }
    return false
  }, [kind, permissions])

  if (!config) return null

  if (isPermissionDeniedOrPrompted || permissions.isLoading) {
    return (
      <Select
        aria-label={t(`${kind}.permissionsNeeded`)}
        label=""
        isDisabled={true}
        items={[]}
        iconComponent={config?.icon}
        placeholder={t('selectDevice.permissionsNeeded')}
      />
    )
  }

  return (
    <SelectDevicePermissions
      id={id}
      onSubmit={onSubmit}
      kind={kind}
      config={config}
    />
  )
}

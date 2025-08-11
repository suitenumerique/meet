import {
  RemixiconComponentType,
  RiMicLine,
  RiVideoOnLine,
  RiVolumeDownLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useEffect, useMemo } from 'react'
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

  /**
   * FALLBACK AUDIO OUTPUT DEVICE SELECTION
   * Auto-selects the only available audio output device when currently on 'default'
   */
  useEffect(() => {
    if (
      kind !== 'audiooutput' ||
      items.length !== 1 ||
      items[0].value === 'default' ||
      activeDeviceId !== 'default'
    )
      return
    onSubmit?.(items[0].value)
    setActiveMediaDevice(items[0].value)
  }, [items, onSubmit, kind, setActiveMediaDevice, activeDeviceId])

  return (
    <Select
      aria-label={t(`${kind}.choose`)}
      label=""
      isDisabled={items.length === 0}
      items={items}
      iconComponent={config?.icon}
      placeholder={
        items.length === 0
          ? t('selectDevice.loading')
          : t('selectDevice.select')
      }
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

  const isPermissionDeniedOrPrompted = useMemo(() => {
    if (kind == 'audioinput') {
      return permissions.isMicrophoneDenied || permissions.isMicrophonePrompted
    }
    if (kind == 'videoinput') {
      return permissions.isCameraDenied || permissions.isCameraPrompted
    }
    if (kind == 'audiooutput') {
      return permissions.isMicrophoneDenied || permissions.isMicrophonePrompted
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

import { useTranslation } from 'react-i18next'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useEffect, useMemo } from 'react'
import { Select, SelectProps } from '@/primitives/Select'
import { Placement } from '@react-types/overlays'
import { useCannotUseDevice } from '../../../hooks/useCannotUseDevice'
import { useDeviceIcons } from '@/features/rooms/livekit/hooks/useDeviceIcons'

type DeviceItems = Array<{ value: string; label: string }>

type SelectDeviceContext = {
  variant?: 'light' | 'dark'
  placement?: Placement
}

type SelectDeviceProps = {
  id?: string
  onSubmit?: (id: string) => void
  kind: MediaDeviceKind
  context?: 'join' | 'room'
}

type SelectDevicePermissionsProps<T> = SelectDeviceProps &
  Pick<SelectProps<T>, 'placement' | 'variant'>

const SelectDevicePermissions = <T extends string | number>({
  id,
  kind,
  onSubmit,
  ...props
}: SelectDevicePermissionsProps<T>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const deviceIcons = useDeviceIcons(kind)

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
      iconComponent={deviceIcons.select}
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
      {...props}
    />
  )
}

export const SelectDevice = ({
  id,
  onSubmit,
  kind,
  context = 'join',
}: SelectDeviceProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join' })

  const contextProps = useMemo<SelectDeviceContext>(() => {
    if (context == 'room') {
      return { variant: 'dark', placement: 'top' }
    }
    return {}
  }, [context])

  const deviceIcons = useDeviceIcons(kind)
  const cannotUseDevice = useCannotUseDevice(kind)

  if (cannotUseDevice) {
    return (
      <Select
        aria-label={t(`${kind}.permissionsNeeded`)}
        label=""
        isDisabled={true}
        items={[]}
        placeholder={t('selectDevice.permissionsNeeded')}
        iconComponent={deviceIcons.select}
        {...contextProps}
      />
    )
  }

  return (
    <SelectDevicePermissions
      id={id}
      onSubmit={onSubmit}
      kind={kind}
      {...contextProps}
    />
  )
}

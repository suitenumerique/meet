import type { IconName } from '@/primitives/Icon'

export interface DeviceIcons {
  toggleOn: IconName
  toggleOff: IconName
  select: IconName
}

const ICONS: Record<MediaDeviceKind | 'default', DeviceIcons> = {
  audioinput: {
    toggleOn: 'mic',
    toggleOff: 'mic-off',
    select: 'mic',
  },
  videoinput: {
    toggleOn: 'meet',
    toggleOff: 'meet-off',
    select: 'meet',
  },
  audiooutput: {
    toggleOn: 'volume-down',
    toggleOff: 'volume-x',
    select: 'volume-down',
  },
  default: { toggleOn: 'mic', toggleOff: 'mic-off', select: 'mic' },
}

export const useDeviceIcons = (kind: MediaDeviceKind): DeviceIcons =>
  ICONS[kind] ?? ICONS.default

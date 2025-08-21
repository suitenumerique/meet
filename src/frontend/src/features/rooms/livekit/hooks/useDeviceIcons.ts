import {
  RemixiconComponentType,
  RiMicLine,
  RiMicOffLine,
  RiVideoOffLine,
  RiVideoOnLine,
  RiVolumeDownLine,
  RiVolumeMuteLine,
} from '@remixicon/react'

export interface DeviceIcons {
  toggleOn: RemixiconComponentType
  toggleOff: RemixiconComponentType
  select: RemixiconComponentType
}

const ICONS: Record<MediaDeviceKind | 'default', DeviceIcons> = {
  audioinput: {
    toggleOn: RiMicLine,
    toggleOff: RiMicOffLine,
    select: RiMicLine,
  },
  videoinput: {
    toggleOn: RiVideoOnLine,
    toggleOff: RiVideoOffLine,
    select: RiVideoOnLine,
  },
  audiooutput: {
    toggleOn: RiVolumeDownLine,
    toggleOff: RiVolumeMuteLine,
    select: RiVolumeDownLine,
  },
  default: { toggleOn: RiMicLine, toggleOff: RiMicOffLine, select: RiMicLine },
}

export const useDeviceIcons = (kind: MediaDeviceKind): DeviceIcons =>
  ICONS[kind] ?? ICONS.default

import { Track } from 'livekit-client'
import { Shortcut } from '@/features/shortcuts/types'

export type ToggleSource = Exclude<
  Track.Source,
  | Track.Source.ScreenShareAudio
  | Track.Source.Unknown
  | Track.Source.ScreenShare
>

export type ToggleDeviceConfig = {
  kind: MediaDeviceKind
  shortcut?: Shortcut
  longPress?: Shortcut
}

type ToggleDeviceConfigMap = {
  [key in ToggleSource]: ToggleDeviceConfig
}

export const TOGGLE_DEVICE_CONFIG = {
  [Track.Source.Microphone]: {
    kind: 'audioinput',
    shortcut: {
      key: 'd',
      ctrlKey: true,
    },
    longPress: {
      key: 'Space',
    },
  },
  [Track.Source.Camera]: {
    kind: 'videoinput',
    shortcut: {
      key: 'e',
      ctrlKey: true,
    },
  },
} as const satisfies ToggleDeviceConfigMap

import { Track } from 'livekit-client'
import { SelectToggleDeviceConfigMap } from '../types/SelectToggleDevice'

import {
  RiMicLine,
  RiMicOffLine,
  RiVideoOffLine,
  RiVideoOnLine,
} from '@remixicon/react'

export const SELECT_TOGGLE_DEVICE_CONFIG: SelectToggleDeviceConfigMap = {
  [Track.Source.Microphone]: {
    kind: 'audioinput',
    iconOn: RiMicLine,
    iconOff: RiMicOffLine,
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
    iconOn: RiVideoOnLine,
    iconOff: RiVideoOffLine,
    shortcut: {
      key: 'e',
      ctrlKey: true,
    },
  },
}

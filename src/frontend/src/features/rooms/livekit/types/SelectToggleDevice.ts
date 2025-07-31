import { Track } from 'livekit-client'
import { RemixiconComponentType } from '@remixicon/react'
import { Shortcut } from '@/features/shortcuts/types'

export type ToggleSource = Exclude<
  Track.Source,
  Track.Source.ScreenShareAudio | Track.Source.Unknown
>

export type SelectToggleSource = Exclude<ToggleSource, Track.Source.ScreenShare>

export type SelectToggleDeviceConfig = {
  kind: MediaDeviceKind
  iconOn: RemixiconComponentType
  iconOff: RemixiconComponentType
  shortcut?: Shortcut
  longPress?: Shortcut
}

export type SelectToggleDeviceConfigMap = {
  [key in SelectToggleSource]: SelectToggleDeviceConfig
}

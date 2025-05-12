import { UsePersistentUserChoicesOptions } from '@livekit/components-react'
import React from 'react'
import { LocalUserChoices } from '../../routes/Room'
import { saveUserChoices, loadUserChoices } from '@livekit/components-core'
import { ProcessorSerialized } from '../components/blur'

/**
 * From @livekit/component-react
 *
 * A hook that provides access to user choices stored in local storage, such as
 * selected media devices and their current state (on or off), as well as the user name.
 * @alpha
 */
export function usePersistentUserChoices(
  options: UsePersistentUserChoicesOptions = {}
) {
  const [userChoices, setSettings] = React.useState<LocalUserChoices>(
    loadUserChoices(options.defaults, options.preventLoad ?? false)
  )

  const saveAudioInputEnabled = React.useCallback((isEnabled: boolean) => {
    setSettings((prev: LocalUserChoices) => ({
      ...prev,
      audioEnabled: isEnabled,
    }))
  }, [])
  const saveVideoInputEnabled = React.useCallback((isEnabled: boolean) => {
    setSettings((prev: LocalUserChoices) => ({
      ...prev,
      videoEnabled: isEnabled,
    }))
  }, [])
  const saveAudioInputDeviceId = React.useCallback((deviceId: string) => {
    setSettings((prev: LocalUserChoices) => ({
      ...prev,
      audioDeviceId: deviceId,
    }))
  }, [])
  const saveVideoInputDeviceId = React.useCallback((deviceId: string) => {
    setSettings((prev: LocalUserChoices) => ({
      ...prev,
      videoDeviceId: deviceId,
    }))
  }, [])
  const saveUsername = React.useCallback((username: string) => {
    setSettings((prev: LocalUserChoices) => ({ ...prev, username: username }))
  }, [])
  const saveProcessorSerialized = React.useCallback(
    (processorSerialized?: ProcessorSerialized) => {
      setSettings((prev: LocalUserChoices) => ({
        ...prev,
        processorSerialized,
      }))
    },
    []
  )

  React.useEffect(() => {
    saveUserChoices(userChoices, options.preventSave ?? false)
  }, [userChoices, options.preventSave])

  return {
    userChoices,
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
    saveUsername,
    saveProcessorSerialized,
  }
}

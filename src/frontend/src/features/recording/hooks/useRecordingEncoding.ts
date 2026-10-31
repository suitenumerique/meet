import { useCallback, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { useConfig } from '@/api/useConfig'
import {
  recordingEncodingStore,
  setRecordingEncodingPreference,
} from '@/stores/recordingEncoding'

export type RecordingEncoding = {
  resolution?: string
  profile?: string
}

export const DEFAULT_ENCODING_OPTION = '__default__'

/**
 * Pick the stored value if the backend still offers it, otherwise the
 * backend default, otherwise the "Default" option.
 */
const resolveValue = (
  available: string[],
  stored?: string,
  fallback?: string | null
): string => {
  if (stored && available.includes(stored)) return stored
  if (fallback && available.includes(fallback)) return fallback
  return DEFAULT_ENCODING_OPTION
}

/**
 * Recording encoding preferences (resolution + profile).
 *
 * Values are persisted in localStorage, per browser, and always
 * reconciled against what the backend currently exposes, so a stale value
 * (e.g. a profile removed by the operator) never reaches the API.
 */
export const useRecordingEncoding = () => {
  const { data } = useConfig()
  const snap = useSnapshot(recordingEncodingStore)

  const encodingConfig = data?.recording?.encoding
  const availableResolutions = useMemo(
    () => encodingConfig?.available_resolutions ?? [],
    [encodingConfig]
  )
  const availableProfiles = useMemo(
    () => encodingConfig?.available_profiles ?? [],
    [encodingConfig]
  )
  const hasDefaultResolution = availableResolutions.includes(
    encodingConfig?.default_resolution ?? ''
  )
  const hasDefaultProfile = availableProfiles.includes(
    encodingConfig?.default_profile ?? ''
  )

  const isCustomEncodingEnabled = !!encodingConfig?.is_custom_enabled

  const resolution = resolveValue(
    availableResolutions,
    snap.resolution,
    encodingConfig?.default_resolution
  )
  const profile = resolveValue(
    availableProfiles,
    snap.profile,
    encodingConfig?.default_profile
  )

  const setResolution = useCallback(
    (value: string) => {
      if (
        value !== DEFAULT_ENCODING_OPTION &&
        !availableResolutions.includes(value)
      )
        return
      setRecordingEncodingPreference({ resolution: value })
    },
    [availableResolutions]
  )

  const setProfile = useCallback(
    (value: string) => {
      if (
        value !== DEFAULT_ENCODING_OPTION &&
        !availableProfiles.includes(value)
      )
        return
      setRecordingEncodingPreference({ profile: value })
    },
    [availableProfiles]
  )

  // Payload for the start-recording API. Undefined when per-recording
  // encoding is disabled, as the backend would reject it.
  const encoding: RecordingEncoding | undefined = useMemo(() => {
    // The API requires a resolution whenever the encoding is modified: a
    // profile cannot be sent alone. So if the resolution is "Default", send
    // no payload at all and let the backend apply its default encoding.
    if (!isCustomEncodingEnabled || resolution === DEFAULT_ENCODING_OPTION)
      return undefined
    return {
      resolution,
      // Omitted when "Default": the backend applies its default profile.
      ...(profile !== DEFAULT_ENCODING_OPTION && { profile }),
    }
  }, [isCustomEncodingEnabled, resolution, profile])

  return {
    isCustomEncodingEnabled,
    availableResolutions,
    availableProfiles,
    hasDefaultResolution,
    hasDefaultProfile,
    resolution,
    profile,
    setResolution,
    setProfile,
    encoding,
  }
}

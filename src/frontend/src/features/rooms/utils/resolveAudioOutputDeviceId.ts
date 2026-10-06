/**
 * `'default'` means "use the system output". Firefox has no device with that
 * id, so setSinkId('default') rejects. Omit it and the browser keeps the OS
 * default, which is the same result.
 */
export const resolveAudioOutputDeviceId = (
  deviceId: string | undefined
): string | undefined => {
  if (!deviceId || deviceId === 'default') return undefined
  return deviceId
}

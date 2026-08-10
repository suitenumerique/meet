export type OS = 'macos' | 'windows' | 'linux' | 'android' | 'other'

export const isAndroid = (): boolean => /android/i.test(navigator.userAgent)

export const getOS = (): OS => {
  const source = `${
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform
  } ${navigator.userAgent}`
  // Android UAs also contain "Linux" (and desktop-mode ones may not say
  // much else), so check it before the desktop platforms.
  if (isAndroid()) return 'android'
  if (/mac/i.test(source)) return 'macos'
  if (/win/i.test(source)) return 'windows'
  if (/linux|x11/i.test(source)) return 'linux'
  return 'other'
}

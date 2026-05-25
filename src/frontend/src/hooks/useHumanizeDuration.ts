import { useCallback, useEffect, useState } from 'react'
import i18n from 'i18next'
import type humanizeDurationType from 'humanize-duration'

// Synchronous, locale-aware fallback shown until `humanize-duration` loads.
// Uses Intl.NumberFormat's `unit` style so we get correct pluralization
// and unit names in every locale without shipping translations.
function fallbackFormat(ms: number, locale: string): string {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)

  const format = (value: number, unit: 'hour' | 'minute' | 'second') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'long',
    }).format(value)

  if (hours >= 1) return format(hours, 'hour')
  if (minutes >= 1) return format(minutes, 'minute')
  return format(seconds, 'second')
}

let humanizeDuration: typeof humanizeDurationType | null = null
let loadPromise: Promise<typeof humanizeDurationType> | null = null

const loadHumanizeDuration = () => {
  loadPromise ??= import('humanize-duration').then((m) => {
    humanizeDuration = m.default
    return m.default
  })
  return loadPromise
}

export const useHumanizeDuration = () => {
  const [isLoaded, setIsLoaded] = useState(() => humanizeDuration !== null)

  useEffect(() => {
    if (isLoaded) return
    let cancelled = false
    loadHumanizeDuration().then(() => {
      if (!cancelled) setIsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [isLoaded])

  return useCallback(
    (
      duration: number | undefined,
      { round, largest }: { round?: boolean; largest?: number } = {}
    ): string | undefined => {
      if (duration == undefined) return undefined
      if (!humanizeDuration || !isLoaded)
        return fallbackFormat(duration, i18n.language)

      return humanizeDuration(duration, {
        language: i18n.language,
        delimiter: ' ',
        ...(round !== undefined && { round }),
        ...(largest !== undefined && { largest }),
      })
    },
    [isLoaded]
  )
}

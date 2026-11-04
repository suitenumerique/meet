export function formatDate(
  date: Date | string | number,
  format: string = 'YYYY-MM-DD'
): string {
  const dateObj = date instanceof Date ? date : new Date(date)

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date'
  }

  const year = dateObj.getFullYear()
  const month = dateObj.getMonth() + 1 // getMonth() returns 0-11
  const day = dateObj.getDate()
  const hours = dateObj.getHours()
  const minutes = dateObj.getMinutes()
  const seconds = dateObj.getSeconds()

  const pad = (num: number): string => String(num).padStart(2, '0')

  let result = format
  result = result.replace(/YYYY/g, year.toString())
  result = result.replace(/MM/g, pad(month))
  result = result.replace(/DD/g, pad(day))
  result = result.replace(/HH/g, pad(hours))
  result = result.replace(/mm/g, pad(minutes))
  result = result.replace(/ss/g, pad(seconds))

  return result
}

/**
 * Format a date as a human-friendly relative time string in the given locale,
 * e.g. "2 hours ago", "yesterday", "3 days ago" (Intl.RelativeTimeFormat with
 * `numeric: 'auto'`), or an empty string for invalid dates.
 */
export function formatRelativeDate(
  date: Date | string | number,
  locale: string = 'en'
): string {
  const dateObj = date instanceof Date ? date : new Date(date)

  if (isNaN(dateObj.getTime())) {
    return ''
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diffMs = dateObj.getTime() - Date.now()

  const minutes = Math.round(diffMs / 60_000)
  const hours = Math.round(diffMs / 3_600_000)
  const days = Math.round(diffMs / 86_400_000)
  const weeks = Math.round(diffMs / 604_800_000)
  const months = Math.round(diffMs / 2_592_000_000) // ~30.44-day months
  const years = Math.round(diffMs / 31_536_000_000) // ~365.25-day years

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  if (Math.abs(days) < 7) return rtf.format(days, 'day')
  if (Math.abs(weeks) < 4) return rtf.format(weeks, 'week')
  if (Math.abs(months) < 12) return rtf.format(months, 'month')
  return rtf.format(years, 'year')
}

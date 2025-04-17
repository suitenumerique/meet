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

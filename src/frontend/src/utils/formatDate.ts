export function formatDate(
  date: Date | string | number,
  format: string = 'YYYY-MM-DD'
): string {
  const dateObj = date instanceof Date ? date : new Date(date)

  if (Number.isNaN(dateObj.getTime())) {
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
  result = result.replaceAll('YYYY', year.toString())
  result = result.replaceAll('MM', pad(month))
  result = result.replaceAll('DD', pad(day))
  result = result.replaceAll('HH', pad(hours))
  result = result.replaceAll('mm', pad(minutes))
  result = result.replaceAll('ss', pad(seconds))

  return result
}

import { downloadBlob } from '@/utils/downloadBlob'
import { formatDate } from '@/utils/formatDate'

export type AttendanceRow = {
  name: string
  signedIn: boolean
  joinedAt?: Date
}

export type AttendanceLabels = {
  name: string
  account: string
  joinedAt: string
  signedIn: string
  guest: string
}

// A guest types their own name, and a spreadsheet runs a cell starting with
// one of these characters as a formula.
const escapeCell = (value: string) => {
  const safe = /^\s*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export const buildAttendanceCsv = (
  rows: AttendanceRow[],
  labels: AttendanceLabels
): string => {
  const lines = [
    [labels.name, labels.account, labels.joinedAt],
    ...rows.map(({ name, signedIn, joinedAt }) => [
      name,
      signedIn ? labels.signedIn : labels.guest,
      // Local time, so the sheet reads in the clock of whoever took the register.
      joinedAt ? formatDate(joinedAt, 'YYYY-MM-DD HH:mm') : '',
    ]),
  ]
  return lines.map((cells) => cells.map(escapeCell).join(',')).join('\r\n')
}

export const downloadAttendance = (csv: string, roomSlug?: string) => {
  const timestamp = formatDate(new Date(), 'YYYY-MM-DD_HH-mm')
  // The byte order mark makes Excel read accented names as UTF-8.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  const filename = ['attendance', roomSlug, timestamp].filter(Boolean).join('-')
  downloadBlob(blob, `${filename}.csv`)
}

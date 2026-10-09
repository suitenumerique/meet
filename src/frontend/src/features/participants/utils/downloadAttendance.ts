import { downloadBlob } from '@/utils/downloadBlob'
import { formatDate } from '@/utils/formatDate'

export type AttendanceRow = {
  name: string
  signedIn: boolean
}

export type AttendanceLabels = {
  name: string
  account: string
  signedIn: string
  guest: string
}

// A guest types their own name, and a spreadsheet may run a cell starting with
// = + - @, or their full-width forms, as a formula, even behind invisible space.
const FORMULA_START =
  /^[\s\u200B-\u200D\u2060]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r]/

const escapeCell = (value: string) => {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export const buildAttendanceCsv = (
  rows: AttendanceRow[],
  labels: AttendanceLabels
): string => {
  const lines = [
    [labels.name, labels.account],
    ...rows.map(({ name, signedIn }) => [
      name,
      signedIn ? labels.signedIn : labels.guest,
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

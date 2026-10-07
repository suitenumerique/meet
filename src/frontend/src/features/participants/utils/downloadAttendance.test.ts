import { describe, expect, it } from 'vitest'
import { buildAttendanceCsv } from './downloadAttendance'

const labels = {
  name: 'Name',
  account: 'Account',
  joinedAt: 'Joined at',
  signedIn: 'Signed in',
  guest: 'Guest',
}

describe('buildAttendanceCsv', () => {
  it('writes one row per person under a header', () => {
    const csv = buildAttendanceCsv(
      [
        { name: 'Zoé', signedIn: true, joinedAt: new Date(2026, 9, 7, 8, 5) },
        { name: 'Sam', signedIn: false },
      ],
      labels
    )
    expect(csv.split('\r\n')).toEqual([
      '"Name","Account","Joined at"',
      '"Zoé","Signed in","2026-10-07 08:05"',
      '"Sam","Guest",""',
    ])
  })

  it('keeps a typed name from running as a spreadsheet formula', () => {
    const csv = buildAttendanceCsv(
      [{ name: '=HYPERLINK("x","y")', signedIn: false }],
      labels
    )
    expect(csv.split('\r\n')[1]).toBe('"\'=HYPERLINK(""x"",""y"")","Guest",""')
  })

  it('keeps every formula trigger as text, after leading spaces too', () => {
    const names = ['+1', '-1', '@SUM(1)', '\t=1', ' =1', 'Ana-Maria']
    const csv = buildAttendanceCsv(
      names.map((name) => ({ name, signedIn: true })),
      labels
    )
    const firstCells = csv
      .split('\r\n')
      .slice(1)
      .map((line) => line.split('","')[0])
    expect(firstCells).toEqual([
      '"\'+1',
      '"\'-1',
      '"\'@SUM(1)',
      '"\'\t=1',
      '"\' =1',
      '"Ana-Maria',
    ])
  })
})

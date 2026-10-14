// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { RoomCountField } from './RoomCountField'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const Field = ({ onChange }: { onChange: (count: number) => void }) => {
  const [count, setCount] = useState(2)
  return (
    <RoomCountField
      value={count}
      onChange={(next) => {
        onChange(next)
        setCount(next)
      }}
    />
  )
}

const type = (typed: string) => {
  const onChange = vi.fn()
  render(<Field onChange={onChange} />)
  const input = screen.getByRole('textbox') as HTMLInputElement
  act(() => input.focus())
  fireEvent.change(input, { target: { value: typed } })
  act(() => input.blur())
  return { calls: onChange.mock.calls, shown: input.value }
}

afterEach(cleanup)

describe('RoomCountField', () => {
  it.each([
    ['2.6', 3],
    ['3.4', 3],
  ])('rounds a typed %s to %i', (typed, count) => {
    expect(type(typed)).toEqual({ calls: [[count]], shown: String(count) })
  })

  it('keeps the count while the field is cleared', () => {
    expect(type('')).toEqual({ calls: [], shown: '2' })
  })
})

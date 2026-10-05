import { useTranslation } from 'react-i18next'
import { Group, Input, Label, NumberField } from 'react-aria-components'
import { RiAddLine, RiSubtractLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { Button } from '@/primitives'
import { MAX_ROOMS, MIN_ROOMS } from '../utils/setup'

// Typed, or stepped with the buttons or the arrow keys, and kept in bounds.
export const RoomCountField = ({
  value,
  onChange,
}: {
  value: number
  onChange: (count: number) => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout.setup' })
  return (
    <NumberField
      value={value}
      minValue={MIN_ROOMS}
      maxValue={MAX_ROOMS}
      onChange={(next) => {
        // A cleared field gives NaN: keep the count until a number is typed.
        if (Number.isInteger(next)) onChange(next)
      }}
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      })}
    >
      <Label className={css({ fontWeight: 'medium', fontSize: 'sm' })}>
        {t('roomCount')}
      </Label>
      <Group
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        })}
      >
        <Button slot="decrement" variant="secondary" size="sm">
          <RiSubtractLine size={16} aria-hidden />
        </Button>
        <Input
          className={css({
            width: '3rem',
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'greyscale.300',
            borderRadius: 4,
            paddingY: '0.25rem',
          })}
        />
        <Button slot="increment" variant="secondary" size="sm">
          <RiAddLine size={16} aria-hidden />
        </Button>
      </Group>
    </NumberField>
  )
}

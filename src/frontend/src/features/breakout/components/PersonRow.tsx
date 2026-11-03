import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { Select } from '@/primitives/Select'

// One person and the room picker that sends them somewhere.
export const PersonRow = ({
  name,
  items,
  selectedKey,
  isDisabled,
  onChange,
}: {
  name: string
  items: { value: number; label: string }[]
  selectedKey: number
  isDisabled?: boolean
  onChange: (room: number) => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  return (
    <li
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      })}
    >
      <Text variant="sm" wrap="pretty">
        {name}
      </Text>
      <div className={css({ width: '10rem', flexShrink: 0 })}>
        <Select
          aria-label={t('setup.assign', { name })}
          label=""
          items={items}
          selectedKey={selectedKey}
          isDisabled={isDisabled}
          onSelectionChange={(key) => onChange(Number(key))}
        />
      </div>
    </li>
  )
}

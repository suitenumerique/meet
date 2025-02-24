import { Div, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { useTranslation } from 'react-i18next'

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
    >
      <Text variant="note" wrap="pretty" margin="md">
        {t('description')}
      </Text>
      <RACSeparator
        className={css({
          border: 'none',
          height: '1px',
          width: '100%',
          background: '#dadce0',
        })}
      />
      <H
        lvl={2}
        className={css({
          fontWeight: 500,
        })}
      >
        {t('access.title')}
      </H>
      <Text
        variant="note"
        wrap="balance"
        className={css({
          textStyle: 'sm',
        })}
        margin={'md'}
      >
        {t('access.description')}
      </Text>
      <div
        className={css({
          marginTop: '1rem',
        })}
      >
        [WIP]
      </div>
    </Div>
  )
}

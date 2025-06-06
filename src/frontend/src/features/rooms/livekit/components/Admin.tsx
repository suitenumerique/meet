import { Div, Field, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'wouter'

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

  const { roomId } = useParams()

  if (!roomId) {
    throw new Error()
  }

  const { mutateAsync: patchRoom } = usePatchRoom()

  const { data: readOnlyData } = useQuery({
    queryKey: [keys.room, roomId],
    queryFn: () => fetchRoom({ roomId }),
    retry: false,
    enabled: false,
  })

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
    >
      <Text
        variant="note"
        wrap="pretty"
        className={css({
          textStyle: 'sm',
        })}
        margin={'md'}
      >
        {t('description')}
      </Text>
      <RACSeparator
        className={css({
          border: 'none',
          height: '1px',
          width: '100%',
          background: 'greyscale.250',
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
      <Field
        type="radioGroup"
        label={t('access.type')}
        aria-label={t('access.type')}
        labelProps={{
          className: css({
            fontSize: '1rem',
            paddingBottom: '1rem',
          }),
        }}
        value={readOnlyData?.access_level}
        onChange={(value) =>
          patchRoom({ roomId, room: { access_level: value as ApiAccessLevel } })
            .then((room) => {
              queryClient.setQueryData([keys.room, roomId], room)
            })
            .catch((e) => console.error(e))
        }
        items={[
          {
            value: ApiAccessLevel.PUBLIC,
            label: t('access.levels.public.label'),
            description: t('access.levels.public.description'),
          },
          {
            value: ApiAccessLevel.TRUSTED,
            label: t('access.levels.trusted.label'),
            description: t('access.levels.trusted.description'),
          },
          {
            value: ApiAccessLevel.RESTRICTED,
            label: t('access.levels.restricted.label'),
            description: t('access.levels.restricted.description'),
          },
        ]}
      />
    </Div>
  )
}

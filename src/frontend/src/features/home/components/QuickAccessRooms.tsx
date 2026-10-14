import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { css } from '@/styled-system/css'
import { Link, Text, H } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { keys } from '@/api/queryKeys'
import { useUser } from '@/features/auth/api/useUser'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { fetchRooms } from '@/features/rooms/api/fetchRooms'
import { formatDate } from '@/utils/formatDate'
import { getRoutePath } from '@/navigation/getRoutePath'

const AccessLevelLabel = ({ accessLevel }: { accessLevel: ApiAccessLevel }) => {
  const { t } = useTranslation('home', {
    keyPrefix: 'quickAccessRooms.access',
  })
  const labelKey =
    accessLevel === ApiAccessLevel.TRUSTED
      ? 'trusted'
      : accessLevel === ApiAccessLevel.RESTRICTED
        ? 'restricted'
        : 'open'

  return <Text variant="note">{t(labelKey)}</Text>
}

export const QuickAccessRooms = () => {
  const { t } = useTranslation('home', { keyPrefix: 'quickAccessRooms' })
  const { isLoggedIn } = useUser()

  const { data, isLoading } = useQuery({
    queryKey: [keys.rooms, { role: 'owner' }],
    queryFn: () => fetchRooms({ role: 'owner' }),
    enabled: isLoggedIn === true,
  })

  if (isLoggedIn !== true) {
    return null
  }

  const rooms = data?.results ?? []

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '28rem',
        gap: '0.75rem',
        '& ul': {
          width: '100%',
          padding: 0,
          margin: 0,
          listStyle: 'none',
        },
      })}
    >
      <H lvl={3} margin="sm">
        {t('heading')}
      </H>
      {isLoading ? (
        <Spinner />
      ) : rooms.length === 0 ? (
        <Text variant="note">{t('empty')}</Text>
      ) : (
        <ul>
          {rooms.map((room) => (
            <li
              key={room.id}
              className={css({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid',
                borderColor: 'greyscale.500',
                '&:last-child': { borderBottom: 0 },
              })}
            >
              <Link
                to={String(getRoutePath('room', room.slug))}
                data-attr="link-to-room"
              >
                {room.slug}
              </Link>
              <div
                className={css({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0.15rem',
                })}
              >
                <AccessLevelLabel accessLevel={room.access_level} />
                <Text variant="smNote">
                  {t('created', {
                    date: room.created_at ? formatDate(room.created_at) : '',
                  })}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import type { Participant } from 'livekit-client'
import { RiDownloadLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { AdminOrOwnerOnly } from '@/features/rooms/components/AdminOrOwnerOnly'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { getParticipantIsAuthenticated } from '@/features/rooms/utils/getParticipantIsAuthenticated'
import {
  buildAttendanceCsv,
  downloadAttendance,
} from '../utils/downloadAttendance'

type DownloadAttendanceButtonProps = {
  participants: Array<Participant>
}

const DownloadAttendanceButtonInner = ({
  participants,
}: DownloadAttendanceButtonProps) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'participants.attendance',
  })
  const roomData = useRoomData()

  const download = () => {
    const csv = buildAttendanceCsv(
      participants.map((p) => ({
        name: getParticipantName(p),
        signedIn: getParticipantIsAuthenticated(p),
        joinedAt: p.joinedAt,
      })),
      {
        name: t('name'),
        account: t('account'),
        joinedAt: t('joinedAt'),
        signedIn: t('signedIn'),
        guest: t('guest'),
      }
    )
    downloadAttendance(csv, roomData?.slug)
  }

  return (
    <Button
      aria-label={t('download')}
      size="sm"
      fullWidth
      variant="tertiary"
      onPress={download}
      data-attr="participants-attendance"
      className={css({
        marginBottom: '0.5rem',
      })}
    >
      <RiDownloadLine size={16} />
      {t('download')}
    </Button>
  )
}

export const DownloadAttendanceButton = ({
  participants,
}: DownloadAttendanceButtonProps) => {
  return (
    <AdminOrOwnerOnly>
      <DownloadAttendanceButtonInner participants={participants} />
    </AdminOrOwnerOnly>
  )
}

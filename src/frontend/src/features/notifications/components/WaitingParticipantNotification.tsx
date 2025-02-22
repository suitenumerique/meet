import { useListWaitingParticipants } from '@/features/rooms/api/listWaitingParticipants'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { StyledToastContainer } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { Button, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { RiInfinityLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

export const WaitingParticipantNotification = () => {
  const data = useRoomData()
  const { t } = useTranslation('notifications', {
    keyPrefix: 'waitingParticipants',
  })
  const { isParticipantsOpen, toggleParticipants } = useSidePanel()
  const { data: readOnlyData } = useListWaitingParticipants(data!.id, {
    retry: false,
    enabled: false,
  })
  const participants = readOnlyData?.participants || []
  if (!participants.length) return
  return (
    <StyledToastContainer role="alert">
      <HStack
        padding={'1rem'}
        gap={'1rem'}
        role={'alertdialog'}
        aria-label={participants.length > 1 ? t('several') : t('one')}
        aria-modal={false}
      >
        <HStack gap={0}>
          <Avatar
            name={participants[0].username}
            bgColor={participants[0].color}
            context="list"
            notification
          />
          {participants.length > 1 && (
            <Avatar
              name={participants[1].username}
              bgColor={participants[1].color}
              context="list"
              notification
              style={{
                marginLeft: '-10px',
              }}
            />
          )}
          {participants.length > 2 && (
            <span
              className={css({
                width: '32px',
                height: '32px',
                fontSize: '1rem',
                color: 'white',
                display: 'flex',
                borderRadius: '50%',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'primaryDark.100',
                border: '2px solid white',
                marginLeft: '-10px',
              })}
            >
              {participants.length < 102 ? (
                <p>+{participants.length - 2}</p>
              ) : (
                <RiInfinityLine size={20} />
              )}
            </span>
          )}
        </HStack>
        <Text
          variant="paragraph"
          margin={false}
          wrap={'balance'}
          style={{
            maxWidth: participants.length == 1 ? '10rem' : '15rem',
          }}
        >
          {participants.length > 1 ? t('several') : t('one')}
        </Text>
        {!isParticipantsOpen && (
          <Button
            size="sm"
            variant="text"
            style={{
              color: '#60a5fa',
            }}
            onPress={() => {
              toggleParticipants()
            }}
          >
            {t('open')}
          </Button>
        )}
      </HStack>
    </StyledToastContainer>
  )
}

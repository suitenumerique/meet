import { StyledToastContainer } from './Toast'
import { HStack, VStack } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { Button, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { RiInfinityLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { usePrevious } from '@/hooks/usePrevious'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import { useWaitingParticipants } from '@/features/rooms/hooks/useWaitingParticipants'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useNotificationSound } from '../hooks/useSoundNotification'
import { NotificationType } from '@/features/notifications'

export const NOTIFICATION_DISPLAY_DURATION = 10000

export const WaitingParticipantNotification = () => {
  const { triggerNotificationSound } = useNotificationSound()

  const { t } = useTranslation('notifications', {
    keyPrefix: 'waitingParticipants',
  })

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const { isParticipantsOpen, toggleParticipants } = useSidePanel()
  const [showQuickActionsMessage, setShowQuickActionsMessage] = useState(false)
  const { waitingParticipants, handleParticipantEntry } =
    useWaitingParticipants()
  const prevWaitingParticipant = usePrevious<WaitingParticipant[] | undefined>(
    waitingParticipants
  )

  const isParticipantListEmpty = (p?: WaitingParticipant[]) => p?.length == 0

  useEffect(() => {
    // Show notification when the first participant enters the waiting room
    if (
      !isParticipantListEmpty(waitingParticipants) &&
      isParticipantListEmpty(prevWaitingParticipant) &&
      !isParticipantsOpen
    ) {
      setShowQuickActionsMessage(true)

      triggerNotificationSound(NotificationType.ParticipantJoined)

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setShowQuickActionsMessage(false)
        timerRef.current = null // Clear the ref when timeout completes
      }, NOTIFICATION_DISPLAY_DURATION)
    } else if (waitingParticipants.length !== prevWaitingParticipant?.length) {
      // Hide notification when the participant count changes
      setShowQuickActionsMessage(false)
    }
  }, [
    waitingParticipants,
    prevWaitingParticipant,
    isParticipantsOpen,
    triggerNotificationSound,
  ])

  useEffect(() => {
    // This cleanup function will only run when the component unmounts
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    // Hide notification when participants panel is opened
    if (isParticipantsOpen) {
      setShowQuickActionsMessage(false)
    }
  }, [isParticipantsOpen])

  if (!waitingParticipants.length) return null

  return (
    <StyledToastContainer role="alert">
      <HStack
        padding={'1rem'}
        gap={'1rem'}
        role={'alertdialog'}
        aria-label={waitingParticipants.length > 1 ? t('several') : t('one')}
        aria-modal={false}
      >
        {showQuickActionsMessage ? (
          <VStack gap={'1rem'} alignItems={'start'}>
            <Text
              variant="paragraph"
              margin={false}
              style={{
                minWidth: '15rem',
              }}
            >
              {t('one')}
            </Text>
            <HStack gap="1rem">
              <Avatar
                name={waitingParticipants[0].username}
                bgColor={waitingParticipants[0].color}
                context="list"
                notification
              />
              <Text
                variant="sm"
                margin={false}
                className={css({
                  maxWidth: '10rem',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                })}
              >
                {waitingParticipants[0].username}
              </Text>
            </HStack>
            <HStack gap="0.25rem" marginLeft="auto">
              <Button
                size="sm"
                variant="text"
                className={css({
                  color: 'primary.300',
                })}
                onPress={async () => {
                  await handleParticipantEntry(waitingParticipants[0], true)
                  setShowQuickActionsMessage(false)
                }}
              >
                {t('accept')}
              </Button>
              <Button
                size="sm"
                variant="text"
                className={css({
                  color: 'primary.300',
                })}
                onPress={() => {
                  toggleParticipants()
                  setShowQuickActionsMessage(false)
                }}
              >
                {t('open')}
              </Button>
            </HStack>
          </VStack>
        ) : (
          <>
            <HStack gap={0}>
              <Avatar
                name={waitingParticipants[0].username}
                bgColor={waitingParticipants[0].color}
                context="list"
                notification
              />
              {waitingParticipants.length > 1 && (
                <Avatar
                  name={waitingParticipants[1].username}
                  bgColor={waitingParticipants[1].color}
                  context="list"
                  notification
                  style={{
                    marginLeft: '-10px',
                  }}
                />
              )}
              {waitingParticipants.length > 2 && (
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
                  {waitingParticipants.length < 102 ? (
                    <p>+{waitingParticipants.length - 2}</p>
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
                maxWidth: waitingParticipants.length == 1 ? '10rem' : '15rem',
              }}
            >
              {waitingParticipants.length > 1 ? t('several') : t('one')}
            </Text>
            {!isParticipantsOpen && (
              <Button
                size="sm"
                variant="text"
                className={css({
                  color: 'primary.300',
                })}
                onPress={() => {
                  toggleParticipants()
                }}
              >
                {t('open')}
              </Button>
            )}
          </>
        )}
      </HStack>
    </StyledToastContainer>
  )
}

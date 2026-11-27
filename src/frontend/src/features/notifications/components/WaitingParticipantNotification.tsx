import { ToastAction, ToastCard } from './ToastCard'
import { HStack } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { usePrevious } from '@/hooks/usePrevious'
import type { WaitingParticipant } from '@/features/participants/api/listWaitingParticipants'
import { useWaitingParticipants } from '@/features/participants/hooks/useWaitingParticipants'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useNotificationSound } from '../hooks/useSoundNotification'
import { NotificationType } from '@/features/notifications'
import { Icon } from '@/primitives/Icon'

export const NOTIFICATION_DISPLAY_DURATION = 10000

export const WaitingParticipantNotification = () => {
  const { triggerNotificationSound } = useNotificationSound()

  const { t } = useTranslation('notifications', {
    keyPrefix: 'waitingParticipants',
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { isParticipantsOpen, toggleParticipants } = useSidePanel()
  const [showQuickActionsMessage, setShowQuickActionsMessage] = useState(false)
  const { waitingParticipants, handleParticipantEntry } =
    useWaitingParticipants()
  const prevWaitingParticipant = usePrevious<WaitingParticipant[] | undefined>(
    waitingParticipants
  )

  const isParticipantListEmpty = (p?: WaitingParticipant[]) => p?.length == 0

  useEffect(() => {
    const previousIds = new Set(prevWaitingParticipant?.map(({ id }) => id))
    const hasNewWaitingParticipant = waitingParticipants.some(
      ({ id }) => !previousIds.has(id)
    )

    if (hasNewWaitingParticipant) {
      triggerNotificationSound(NotificationType.ParticipantWaiting)
    }

    // Show notification when the first participant enters the waiting room
    if (
      !isParticipantListEmpty(waitingParticipants) &&
      isParticipantListEmpty(prevWaitingParticipant) &&
      !isParticipantsOpen
    ) {
      setShowQuickActionsMessage(true)

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

  const label = waitingParticipants.length > 1 ? t('several') : t('one')

  return (
    <div role="alert">
      {showQuickActionsMessage ? (
        <ToastCard
          role="alertdialog"
          aria-label={label}
          aria-modal={false}
          icon={
            <Avatar
              name={waitingParticipants[0].username}
              bgColor={waitingParticipants[0].color}
              context="list"
              notification
            />
          }
          title={t('one')}
          actions={
            <>
              <ToastAction
                onPress={async () => {
                  await handleParticipantEntry(waitingParticipants[0], true)
                  setShowQuickActionsMessage(false)
                }}
              >
                {t('accept')}
              </ToastAction>
              <ToastAction
                onPress={() => {
                  toggleParticipants()
                  setShowQuickActionsMessage(false)
                }}
              >
                {t('open')}
              </ToastAction>
            </>
          }
        >
          {waitingParticipants[0].username}
        </ToastCard>
      ) : (
        <ToastCard
          role="alertdialog"
          aria-label={label}
          aria-modal={false}
          icon={
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
                    fontSize: '0.875rem',
                    color: 'white',
                    display: 'flex',
                    borderRadius: '50%',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'gray.700',
                    border: '2px solid white',
                    marginLeft: '-10px',
                  })}
                >
                  {waitingParticipants.length < 102 ? (
                    <p>+{waitingParticipants.length - 2}</p>
                  ) : (
                    <Icon name="infinity" size={20} />
                  )}
                </span>
              )}
            </HStack>
          }
          actions={
            !isParticipantsOpen && (
              <ToastAction
                onPress={() => {
                  toggleParticipants()
                }}
              >
                {t('open')}
              </ToastAction>
            )
          }
        >
          {label}
        </ToastCard>
      )}
    </div>
  )
}

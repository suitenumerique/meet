import { useEffect, useState } from 'react'
import {
  useConnectionState,
  useRoomContext,
  useRoomInfo,
} from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { usePrevious } from '@/hooks/usePrevious'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { toastQueue } from '@/features/notifications/components/ToastProvider'
import { NotificationType } from '@/features/notifications/NotificationType'
import { NotificationDuration } from '@/features/notifications/NotificationDuration'
import { useNotificationSound } from '@/features/notifications/hooks/useSoundNotification'
import { resetBreakout } from '../store'
import { useBreakoutGroup } from '../hooks/useBreakoutGroup'
import { useBreakoutIsolation } from '../hooks/useBreakoutIsolation'
import { readSignal } from '../utils/group'

// Where the flag is off, nothing runs until a split shows up, then it stays.
export const BreakoutParticipant = ({
  isolatedOnJoin,
}: {
  isolatedOnJoin: boolean
}) => {
  const { metadata } = useRoomInfo()
  const [isNeeded, setIsNeeded] = useState(isolatedOnJoin)
  if (!isNeeded && (isolatedOnJoin || readSignal(metadata) !== null))
    setIsNeeded(true)
  return isNeeded ? <InBreakoutMeeting isolatedOnJoin={isolatedOnJoin} /> : null
}

const InBreakoutMeeting = ({ isolatedOnJoin }: { isolatedOnJoin: boolean }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout.participant' })
  const { isOpen, roomName } = useBreakoutGroup()
  const { triggerNotificationSound } = useNotificationSound()
  useBreakoutIsolation(isolatedOnJoin)
  // The host's plan belongs to this meeting only.
  useEffect(() => resetBreakout, [])

  // Moving into a room and the rooms closing each get a toast and a sound.
  const wasOpen = usePrevious(isOpen)
  const lastRoomName = usePrevious(roomName)
  const room = useRoomContext()
  // Back in the main room, a microphone left on would reach everyone at once.
  useEffect(() => {
    if (lastRoomName && !roomName)
      void room.localParticipant.setMicrophoneEnabled(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName])
  useEffect(() => {
    const moved = !!roomName && roomName !== lastRoomName
    const closed = !!wasOpen && !isOpen
    if (!moved && !closed) return
    triggerNotificationSound(NotificationType.BreakoutRoomChanged)
    toastQueue.add(
      {
        type: NotificationType.BreakoutRoomChanged,
        room: roomName,
      },
      { timeout: NotificationDuration.BREAKOUT_ROOM_CHANGED }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, roomName])

  // While the connection drops, the meeting's own messages hold the top.
  const isConnected = useConnectionState() === ConnectionState.Connected
  if (!isOpen || !isConnected) return null
  return (
    <output
      className={css({
        position: 'fixed',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        paddingY: '0.25rem',
        paddingX: '0.75rem',
        borderRadius: '4px',
        backgroundColor: 'primaryDark.100',
        color: 'white',
      })}
    >
      {roomName ? t('currentRoom', { room: roomName }) : t('mainRoom')}
    </output>
  )
}

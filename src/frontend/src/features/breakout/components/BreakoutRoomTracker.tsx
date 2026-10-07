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
import { resetBreakoutSetup } from '../store'
import { appendDivider } from '@/stores/chat'
import { useMyBreakoutRoom } from '../hooks/useMyBreakoutRoom'
import { useBreakoutMediaPermissions } from '../hooks/useBreakoutMediaPermissions'
import { readSplit } from '../utils/split'

// Follows this browser's breakout room for everyone in the meeting: who hears
// it, the banner, the toasts and the chat dividers. Where the flag is off,
// nothing runs until a split shows up, then it stays.
export const BreakoutRoomTracker = ({
  restrictedBeforeConnect,
}: {
  restrictedBeforeConnect: boolean
}) => {
  const { metadata } = useRoomInfo()
  const [isNeeded, setIsNeeded] = useState(restrictedBeforeConnect)
  if (!isNeeded && (restrictedBeforeConnect || readSplit(metadata) !== null))
    setIsNeeded(true)
  return isNeeded ? (
    <InBreakoutMeeting restrictedBeforeConnect={restrictedBeforeConnect} />
  ) : null
}

const InBreakoutMeeting = ({
  restrictedBeforeConnect,
}: {
  restrictedBeforeConnect: boolean
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout.participant' })
  const { isSplit, roomName } = useMyBreakoutRoom()
  const { triggerNotificationSound } = useNotificationSound()
  useBreakoutMediaPermissions(restrictedBeforeConnect)
  // The host's plan belongs to this meeting only.
  useEffect(() => resetBreakoutSetup, [])

  // Each change of room plays a sound. The banner names the room, so a toast
  // says only what it cannot: the microphone turned off, or the rooms closed.
  const wasSplit = usePrevious(isSplit)
  const lastRoomName = usePrevious(roomName)
  const room = useRoomContext()
  useEffect(() => {
    // A new room starts muted: a microphone left on would reach new people at once.
    const changed = lastRoomName !== undefined && roomName !== lastRoomName
    const muted = changed && room.localParticipant.isMicrophoneEnabled
    if (muted) void room.localParticipant.setMicrophoneEnabled(false)
    // moved also covers a browser that loads straight into its room; changed
    // covers the host sending this browser back to the main room.
    const moved = !!roomName && roomName !== lastRoomName
    const closed = !!wasSplit && !isSplit
    if (!moved && !changed && !closed) return
    triggerNotificationSound(NotificationType.BreakoutRoomChanged)
    if (!closed && !muted) return
    toastQueue.add(
      { type: NotificationType.BreakoutRoomChanged, closed, muted },
      { timeout: NotificationDuration.BREAKOUT_ROOM_CHANGED }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplit, roomName])

  // The chat marks each change of who this browser's messages reach.
  useEffect(() => {
    if (lastRoomName === undefined) return
    if (roomName === lastRoomName && isSplit === wasSplit) return
    if (!isSplit) appendDivider(t('chatAll'))
    else if (roomName) appendDivider(t('chatRoom', { room: roomName }))
    else appendDivider(t('chatMain'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplit, roomName])

  // While the connection drops, the meeting's own messages hold the top.
  const isConnected = useConnectionState() === ConnectionState.Connected
  if (!isSplit || !isConnected) return null
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

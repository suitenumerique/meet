import {
  useParticipantAttribute,
  useRoomContext,
} from '@livekit/components-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { toastQueue } from '@/features/notifications/components/ToastProvider'
import { NotificationType } from '@/features/notifications/NotificationType'
import { NotificationDuration } from '@/features/notifications/NotificationDuration'
import { RiCupLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'
import { reportError } from '@/features/analytics/telemetry'
import { useUpdateAwayStatus } from '@/features/rooms/api/updateAwayStatus'
import { AWAY_ATTRIBUTE } from '@/features/rooms/livekit/constants/awayStatus'

import {
  hasPendingMediaRestore,
  updateAwayMode,
} from '@/features/rooms/livekit/utils/awayTransition'

const busyRooms = new WeakSet<object>()

export function AwayToggle({
  onPress,
  mobile = false,
}: {
  onPress?: () => void
  mobile?: boolean
}) {
  const room = useRoomContext()
  const participant = room.localParticipant
  const awayAttribute = useParticipantAttribute(AWAY_ATTRIBUTE, { participant })
  const isAway = awayAttribute === 'away'
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const { updateAwayStatus } = useUpdateAwayStatus()
  const { t } = useTranslation('rooms')
  const announce = useScreenReaderAnnounce()

  const toggleAway = async () => {
    if (inFlight.current || busyRooms.has(room)) return
    inFlight.current = true
    busyRooms.add(room)
    setPending(true)
    const returning = isAway || hasPendingMediaRestore(room)
    try {
      await updateAwayMode(room, participant, isAway, updateAwayStatus)
      announce(
        t(returning ? 'controls.away.returned' : 'controls.away.activated')
      )
      onPress?.()
    } catch (error) {
      reportError('generic_failure', error, { context: 'toggle_away_status' })
      announce(t('controls.away.failure'), 'assertive')
      toastQueue.add(
        {
          type: NotificationType.AwayModeFailure,
          message: t('controls.away.failure'),
        },
        { timeout: NotificationDuration.ALERT }
      )
    } finally {
      busyRooms.delete(room)
      inFlight.current = false
      setPending(false)
    }
  }

  const label = t(
    hasPendingMediaRestore(room)
      ? 'controls.away.retryRestore'
      : isAway
        ? 'controls.away.return'
        : 'controls.away.leave'
  )
  return (
    <ToggleButton
      variant={mobile ? 'primaryTextDark' : 'primaryDark'}
      square
      description={mobile}
      isSelected={isAway}
      aria-label={label}
      tooltip={label}
      isDisabled={pending}
      onPress={toggleAway}
      data-attr="controls-away-toggle"
    >
      <RiCupLine aria-hidden="true" size={24} />
    </ToggleButton>
  )
}

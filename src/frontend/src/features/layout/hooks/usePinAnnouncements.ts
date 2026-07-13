import { useEffect, useRef, useCallback } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { Participant } from 'livekit-client'
import { useSnapshot } from 'valtio'
import { useTranslation } from 'react-i18next'
import { layoutStore } from '@/stores/layout'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'

export const usePinAnnouncements = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'pinAnnouncements' })
  const { t: tRooms } = useTranslation('rooms')

  const room = useRoomContext()
  const announce = useScreenReaderAnnounce()

  const { pinnedTrackRef } = useSnapshot(layoutStore)
  const lastPinnedIdentityRef = useRef<string | null>(null)

  const getAnnouncementName = useCallback(
    (participant?: Participant | null) => {
      if (!participant) return tRooms('participants.unknown')
      return participant.isLocal
        ? tRooms('participants.you')
        : getParticipantName(participant)
    },
    [tRooms]
  )

  const pinnedIdentity = pinnedTrackRef?.participant?.identity ?? null

  useEffect(() => {
    // 1. unpin
    if (!pinnedIdentity) {
      const lastIdentity = lastPinnedIdentityRef.current
      if (!lastIdentity) return

      const lastParticipant =
        room.localParticipant.identity === lastIdentity
          ? room.localParticipant
          : room.remoteParticipants.get(lastIdentity)

      announce(
        lastParticipant?.isLocal
          ? t('self.unpin')
          : t('unpin', { name: getAnnouncementName(lastParticipant) })
      )

      lastPinnedIdentityRef.current = null
      return
    }

    // 2. same pin → do nothing
    if (lastPinnedIdentityRef.current === pinnedIdentity) return

    // 3. new pin
    const participant =
      room.localParticipant.identity === pinnedIdentity
        ? room.localParticipant
        : room.remoteParticipants.get(pinnedIdentity)

    lastPinnedIdentityRef.current = pinnedIdentity

    announce(
      participant?.isLocal
        ? t('self.pin')
        : t('pin', { name: getAnnouncementName(participant) })
    )
  }, [pinnedIdentity, announce, getAnnouncementName, room, t])
}

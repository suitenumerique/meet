/**
 * Small banner shown on a participant tile when LiveKit raises an
 * EncryptionError for that participant — typically a passphrase/key
 * mismatch ("you and they don't share the same encryption key"). The
 * avatar stays visible behind the banner.
 *
 * Cleared automatically once frames decrypt again
 * (ParticipantEncryptionStatusChanged with encrypted=true).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Participant, RoomEvent } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { RiLockFill } from '@remixicon/react'

import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

interface Props {
  participant: Participant
}

export function DecryptionFailedTileOverlay({ participant }: Props) {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'encryption.decryptionFailed',
  })
  const room = useRoomContext()
  const roomData = useRoomData()

  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!roomData?.is_encrypted) return
    if (participant.isLocal) return

    const identity = participant.identity

    const onError = (_err: Error, p?: Participant) => {
      if (p?.identity === identity) setFailed(true)
    }
    const onStatus = (encrypted: boolean, p?: Participant) => {
      if (p?.identity === identity && encrypted) setFailed(false)
    }

    room.on(RoomEvent.EncryptionError, onError)
    room.on(RoomEvent.ParticipantEncryptionStatusChanged, onStatus)
    return () => {
      room.off(RoomEvent.EncryptionError, onError)
      room.off(RoomEvent.ParticipantEncryptionStatusChanged, onStatus)
    }
  }, [room, roomData?.is_encrypted, participant])

  if (!failed) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '2.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        borderRadius: '0.5rem',
        padding: '0.6rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.3rem',
        maxWidth: '85%',
        zIndex: 4,
        pointerEvents: 'none',
      }}
      role="status"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          color: '#f87171',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}
      >
        <RiLockFill size={14} />
        <span>{t('title')}</span>
      </div>
      <div
        style={{
          color: '#d1d5db',
          fontSize: '0.75rem',
          textAlign: 'center',
          lineHeight: 1.4,
          maxWidth: '22rem',
        }}
      >
        {t('body')}
      </div>
    </div>
  )
}

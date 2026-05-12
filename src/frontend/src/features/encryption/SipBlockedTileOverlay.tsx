/**
 * Small banner shown on top of a SIP/phone participant's tile when the room
 * is live-encrypted (encrypted AND not paused). The avatar (LiveKit's
 * ParticipantPlaceholder) stays visible behind it; this is just a callout
 * near the bottom of the tile so everyone in the room knows why the caller
 * isn't producing audio/video. Admins get a CTA to pause encryption.
 *
 * Detection is kind-then-identity: ParticipantKind.SIP is the canonical
 * signal but we also accept identities prefixed `sip_` so the UI keeps
 * working if a gateway revision forgets to set the kind enum.
 */
import { useTranslation } from 'react-i18next'
import { Participant, ParticipantKind } from 'livekit-client'
import { RiLockFill } from '@remixicon/react'

import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'

function isSipParticipant(p: Participant): boolean {
  if (p.kind === ParticipantKind.SIP) return true
  return p.identity.startsWith('sip_')
}

interface Props {
  participant: Participant
}

export function SipBlockedTileOverlay({ participant }: Props) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption.sipBlocked' })
  const room = useRoomData()
  const isAdmin = useIsAdminOrOwner()

  const liveEncryption =
    !!room && !!room.is_encrypted && !room.encryption_paused
  if (!liveEncryption) return null
  if (!isSipParticipant(participant)) return null

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
        gap: '0.4rem',
        maxWidth: '85%',
        zIndex: 4,
        pointerEvents: 'auto',
      }}
      role="status"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          color: '#fbbf24',
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
        {isAdmin ? t('bodyAdmin') : t('bodyParticipant')}
      </div>
    </div>
  )
}

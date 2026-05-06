/**
 * Tiny per-participant identity confidence pill, shown in encrypted meetings.
 *
 * - "ProConnect" → server-verified identity (the participant signed in).
 * - "Anonymous"  → self-declared name; treat with caution.
 *
 * Sourced from the `is_authenticated` JWT attribute set in
 * `core/utils.py::generate_token` (or the equivalent flag on a lobby
 * participant). No fingerprints, no email — just a one-glance signal.
 */
import { css } from '@/styled-system/css'
import { RiShieldCheckFill, RiUserLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import type { Participant } from 'livekit-client'

interface BadgeProps {
  size?: 'sm' | 'md'
}

interface FromParticipantProps extends BadgeProps {
  participant: Participant
  isAuthenticated?: never
}

interface FromFlagProps extends BadgeProps {
  isAuthenticated: boolean
  participant?: never
}

export function IdentityBadge(props: FromParticipantProps | FromFlagProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'identity' })
  const isAuthenticated =
    props.participant !== undefined
      ? props.participant.attributes?.is_authenticated === 'true'
      : props.isAuthenticated
  const px = props.size === 'md' ? 14 : 12

  const label = isAuthenticated ? t('proconnect') : t('anonymous')
  const color = isAuthenticated ? '#1e40af' : '#b45309'
  const bg = isAuthenticated ? 'rgba(30,64,175,0.10)' : 'rgba(180,83,9,0.10)'

  return (
    <span
      title={label}
      aria-label={label}
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem',
        padding: '0 0.3rem',
        borderRadius: '0.25rem',
        fontSize: '0.65rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      })}
      style={{ backgroundColor: bg, color }}
    >
      {isAuthenticated ? (
        <RiShieldCheckFill size={px} color={color} />
      ) : (
        <RiUserLine size={px} color={color} />
      )}
      {label}
    </span>
  )
}

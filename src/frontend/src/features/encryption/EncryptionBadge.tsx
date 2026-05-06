/**
 * Per-participant encryption trust badge.
 *
 * In advanced mode:
 * - "verified": Green shield — fingerprint explicitly trusted
 * - "unknown": Grey shield — has public key, not yet verified
 * - "refused": Red shield — fingerprint previously refused
 * - "authenticated": Blue shield — ProConnect, no vault keys
 * - "anonymous": Orange warning — not signed in
 *
 * In basic mode:
 * - "authenticated": Blue shield — ProConnect
 * - "anonymous": Orange warning — not signed in
 */
import {
  RiShieldCheckFill,
  RiShieldFill,
  RiShieldCrossFill,
  RiErrorWarningFill,
  RiLockFill,
} from '@remixicon/react'
import type { TrustLevel } from './types'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

interface EncryptionBadgeProps {
  trustLevel: TrustLevel | null
  isEncrypted: boolean
}

export function EncryptionBadge({
  trustLevel,
  isEncrypted,
}: EncryptionBadgeProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption.badge' })

  if (!isEncrypted) return null

  let icon: React.ReactNode
  let label: string

  switch (trustLevel) {
    case 'verified':
      icon = <RiShieldCheckFill size={14} color="#22c55e" />
      label = t('verified')
      break
    case 'unknown':
      icon = <RiShieldFill size={14} color="#9ca3af" />
      label = t('unknown')
      break
    case 'refused':
      icon = <RiShieldCrossFill size={14} color="#ef4444" />
      label = t('refused')
      break
    case 'authenticated':
      icon = <RiShieldCheckFill size={14} color="#3b82f6" />
      label = t('authenticated')
      break
    case 'anonymous':
      icon = <RiErrorWarningFill size={15} color="#d97706" />
      label = t('anonymous')
      break
    default:
      icon = <RiLockFill size={14} />
      label = t('default')
      break
  }

  return (
    <span
      aria-label={label}
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        marginRight: '0.15rem',
        cursor: 'inherit',
      })}
    >
      {icon}
    </span>
  )
}

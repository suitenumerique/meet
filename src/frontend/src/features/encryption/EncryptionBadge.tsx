/**
 * Per-participant encryption trust badge.
 *
 * Single icon per trust level, consistent with lobby badges:
 * - "verified": Green shield — identity confirmed via PKI
 * - "authenticated": Blue shield — ProConnect-authenticated, ephemeral key
 * - "anonymous": Orange warning — identity not verified, ephemeral key
 * - default (no trust level): Lock icon — encrypted, trust level unknown
 */
import { RiShieldCheckFill, RiAlertFill, RiLockFill } from '@remixicon/react'
import type { TrustLevel } from './types'
import { css } from '@/styled-system/css'
import { TooltipWrapper } from '@/primitives/TooltipWrapper'

interface EncryptionBadgeProps {
  trustLevel: TrustLevel | null
  isEncrypted: boolean
}

export function EncryptionBadge({
  trustLevel,
  isEncrypted,
}: EncryptionBadgeProps) {
  if (!isEncrypted) return null

  let icon: React.ReactNode
  let tooltip: string

  switch (trustLevel) {
    case 'verified':
      icon = <RiShieldCheckFill size={14} color="#22c55e" />
      tooltip = 'Verified encryption'
      break
    case 'authenticated':
      icon = <RiShieldCheckFill size={14} color="#3b82f6" />
      tooltip = 'Encrypted (authenticated)'
      break
    case 'anonymous':
      icon = <RiAlertFill size={14} color="#f59e0b" />
      tooltip = 'Encrypted (anonymous)'
      break
    default:
      icon = <RiLockFill size={14} />
      tooltip = 'Encrypted'
      break
  }

  return (
    <TooltipWrapper tooltip={tooltip} tooltipType="instant">
      <span
        role="img"
        aria-label={tooltip}
        tabIndex={0}
        className={css({
          display: 'inline-flex',
          alignItems: 'center',
          marginRight: '0.25rem',
          cursor: 'default',
        })}
      >
        {icon}
      </span>
    </TooltipWrapper>
  )
}

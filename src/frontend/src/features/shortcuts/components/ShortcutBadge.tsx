import React from 'react'
import { css, cx } from '@/styled-system/css'

type ShortcutBadgeProps = {
  visualLabel: string
  srLabel?: string
  className?: string
}

const badgeStyle = css({
  fontFamily: 'monospace',
  backgroundColor: 'rgba(255,255,255,0.12)',
  paddingInline: '0.4rem',
  paddingBlock: '0.2rem',
  borderRadius: '6px',
  whiteSpace: 'nowrap',
  minWidth: '5.5rem',
  textAlign: 'center',
})

export const ShortcutBadge: React.FC<ShortcutBadgeProps> = ({
  visualLabel,
  srLabel,
  className,
}) => {
  return (
    <>
      <div className={cx(badgeStyle, className)} aria-hidden="true">
        <span>{visualLabel}</span>
      </div>
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </>
  )
}

/**
 * Small pill used to surface a feature name with an icon, e.g. in the
 * encrypted-room create dialog, the "Meeting information" panel and the
 * floating share dialog — the three places that list disabled features.
 */
import { css } from '@/styled-system/css'
import { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  size?: 'sm' | 'md'
}

export const FeaturePill = ({ icon, label, size = 'md' }: Props) => {
  const fontSize = size === 'sm' ? '0.8rem' : '0.85rem'
  const padding = size === 'sm' ? '0.3rem 0.6rem' : '0.4rem 0.7rem'
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        borderRadius: '0.5rem',
        border: '1px solid',
        borderColor: 'greyscale.250',
        color: 'greyscale.700',
        backgroundColor: 'white',
        whiteSpace: 'nowrap',
      })}
      style={{ fontSize, padding }}
    >
      {icon}
      {label}
    </span>
  )
}

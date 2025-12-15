import React, { ReactNode } from 'react'
import { css } from '@/styled-system/css'

export interface KeyboardShortcutHintProps {
  children: ReactNode
}

/**
 * Small reusable bubble used to display and announce keyboard shortcuts,
 * typically when an element receives keyboard focus.
 */
export const KeyboardShortcutHint: React.FC<KeyboardShortcutHintProps> = ({
  children,
}) => {
  return (
    <div
      className={css({
        position: 'absolute',
        top: '0.75rem',
        right: '0.75rem',
        backgroundColor: 'rgba(0,0,0,0.5)',
        color: 'white',
        borderRadius: 'calc(var(--lk-border-radius) / 2)',
        paddingInline: '0.5rem',
        paddingBlock: '0.1rem',
        fontSize: '0.875rem',
      })}
    >
      {children}
    </div>
  )
}

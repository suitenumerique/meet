import { css } from '@/styled-system/css'
import { ReactNode } from 'react'

type RowPosition = 'first' | 'middle' | 'last' | 'single'

const BORDER_RADIUS_MAP: Record<RowPosition, string> = {
  first: '4px 4px 0 0',
  middle: '0',
  last: '0 0 4px 4px',
  single: '4px',
} as const

interface RowWrapperProps {
  iconName: string
  children: ReactNode
  position?: RowPosition
}

export const RowWrapper = ({
  iconName,
  children,
  position = 'middle',
}: RowWrapperProps) => {
  return (
    <div
      style={{
        borderRadius: BORDER_RADIUS_MAP[position],
      }}
      className={css({
        width: '100%',
        background: 'gray.100',
        padding: '8px',
        display: 'flex',
        marginTop: '4px',
      })}
    >
      <div
        className={css({
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        })}
      >
        {/*  fixme - doesn't handle properly material-symbols  */}
        <span className="material-icons">{iconName}</span>
      </div>
      <div
        className={css({
          flex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        })}
      >
        {children}
      </div>
    </div>
  )
}

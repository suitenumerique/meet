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
        paddingBlock: '0.5rem',
        paddingInline: '0',
        display: 'flex',
        marginTop: '0.25rem',
      })}
    >
      <div
        className={css({
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          paddingInline: '0.25rem',
        })}
      >
        {/*  fixme - doesn't handle properly material-symbols  */}
        <span className="material-icons">{iconName}</span>
      </div>
      <div
        className={css({
          flex: 6,
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          paddingInlineEnd: '8px',
        })}
      >
        {children}
      </div>
    </div>
  )
}

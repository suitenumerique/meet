import { css } from '@/styled-system/css'
import { ReactNode } from 'react'
import { Icon } from '@/primitives'

type RowPosition = 'first' | 'middle' | 'last' | 'single'

interface RowWrapperProps {
  iconName: string
  children: ReactNode
  position?: RowPosition
}

export const RowWrapper = ({ iconName, children }: RowWrapperProps) => {
  return (
    <div
      className={css({
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        marginTop: '0.5rem',
        paddingBlock: '0.75rem',
        paddingInline: '1rem',
        color: 'content.semantic.neutral.secondary',
        backgroundColor: 'background.semantic.neutral.tertiary',
        border: '1px solid',
        borderColor: 'border.semantic.neutral.tertiary',
        borderRadius: '4px',
      })}
    >
      <Icon
        name={iconName}
        aria-hidden="true"
        className={css({
          width: '1.25rem',
          height: '1.25rem',
        })}
      />
      <div
        className={css({
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: '0.25rem',
          '& a, & button': {
            color: 'inherit!',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
          },
        })}
      >
        {children}
      </div>
    </div>
  )
}

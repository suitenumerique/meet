import {
  Switch as RACSwitch,
  SwitchProps as RACSwitchProps,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { StyledVariantProps } from '@/styled-system/types'
import { ReactNode } from 'react'

export const StyledSwitch = styled(RACSwitch, {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.571rem',
    color: 'black',
    forcedColorAdjust: 'none',
    '& .indicator': {
      position: 'relative',
      width: '2.6rem',
      height: '1.563rem',
      border: '0.125rem solid',
      borderColor: 'primary.800',
      borderRadius: '1.143rem',
      transition: 'all 200ms, outline 200ms',
      _before: {
        content: '""',
        display: 'block',
        margin: '0.125rem',
        width: '1.063rem',
        height: '1.063rem',
        borderRadius: '1.063rem',
        border: '2px solid',
        borderColor: 'primary.800',
        background: 'white',
        transition: 'opacity 10ms',
        transitionDelay: '0ms',
      },
    },
    '& .checkmark': {
      position: 'absolute',
      display: 'block',
      top: '50%',
      right: '0.25rem',
      transform: 'translateY(-50%)',
      color: 'primary.800',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      zIndex: 1,
      opacity: 0,
    },
    '&[data-selected] .indicator': {
      borderColor: 'primary.800',
      background: 'primary.800',
      _before: {
        border: 'none',
        background: 'white',
        transform: 'translateX(100%)',
      },
    },
    '&[data-selected] .checkmark': {
      opacity: 1,
      transition: 'opacity 30ms',
      transitionDelay: '150ms',
    },
    '&[data-disabled] .indicator': {
      borderColor: 'primary.200',
      background: 'transparent',
      _before: {
        background: 'primary.200',
      },
    },
    '&[data-focus-visible] .indicator': {
      outline: '2px solid!',
      outlineColor: 'focusRing!',
      outlineOffset: '2px!',
    },
  },
  variants: {},
})

export type SwitchProps = StyledVariantProps<typeof StyledSwitch> &
  RACSwitchProps & { children: ReactNode }

/**
 * Styled RAC Switch.
 */
export const Switch = ({ children, ...props }: SwitchProps) => (
  <StyledSwitch {...props}>
    <div className="indicator">
      <span className="checkmark">✓</span>
    </div>
    {children}
  </StyledSwitch>
)

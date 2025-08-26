import {
  Switch as RACSwitch,
  SwitchProps as RACSwitchProps,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { StyledVariantProps } from '@/styled-system/types'

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
        willChange: 'transform',
        content: '""',
        display: 'block',
        margin: '0.125rem',
        width: '1.063rem',
        height: '1.063rem',
        borderRadius: '1.063rem',
        background: 'primary.800',
        transition: 'transform 200ms, background-color 200ms',
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
      pointerEvents: 'none',
      zIndex: 1,
      opacity: 0,
    },
    '& .cross': {
      position: 'absolute',
      display: 'block',
      top: '50%',
      left: '0.375rem',
      transform: 'translateY(-50%)',
      color: 'white',
      fontSize: '0.70rem',
      fontWeight: 'bold',
      pointerEvents: 'none',
      zIndex: 1,
      opacity: 1,
      transition: 'opacity 200ms',
      transitionDelay: '0ms',
    },
    '&[data-selected] .indicator': {
      borderColor: 'primary.800',
      background: 'primary.800',
      _before: {
        background: 'white',
        transform: 'translateX(100%)',
      },
    },
    '&[data-selected] .checkmark': {
      opacity: 1,
      transition: 'opacity 30ms',
      transitionDelay: '150ms',
    },
    '&[data-selected] .cross': {
      opacity: 0,
      transition: 'opacity 10ms',
      transitionDelay: '0ms',
    },
    '&[data-disabled] .indicator': {
      borderColor: 'primary.200',
      background: 'transparent',
      _before: {
        background: 'primary.200',
      },
    },
    '&[data-disabled] .cross': {
      color: 'primary.500',
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
  RACSwitchProps

/**
 * Styled RAC Switch.
 */
export const Switch = ({ children, ...props }: SwitchProps) => (
  <StyledSwitch {...props}>
    {(renderProps) => (
      <>
        <div className="indicator">
          <span className="checkmark" aria-hidden="true">
            ✓
          </span>
          <span className="cross" aria-hidden="true">
            ✕
          </span>
        </div>
        {typeof children === 'function' ? children(renderProps) : children}
      </>
    )}
  </StyledSwitch>
)

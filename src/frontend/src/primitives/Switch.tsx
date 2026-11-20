import {
  Switch as RACSwitch,
  SwitchProps as RACSwitchProps,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { type StyledVariantProps } from '@/styled-system/types'
import { RiCheckLine, RiCloseFill } from '@remixicon/react'

// Follows the switch of the UI kit (its `forms-switch` component tokens). The
// check and the cross on the handle are ours: the state does not rely on
// color alone.
const StyledSwitch = styled(RACSwitch, {
  base: {
    display: 'flex',
    // anchor the visually hidden input, so it scrolls with the switch
    position: 'relative',
    alignItems: 'center',
    gap: 'xs',
    color: 'content.semantic.neutral.primary',
    cursor: 'pointer',
    forcedColorAdjust: 'none',
    '& .indicator': {
      position: 'relative',
      flexShrink: 0,
      width: '2.8125rem',
      height: '1.5rem',
      borderRadius: 'full',
      backgroundColor: 'content.semantic.neutral.tertiary',
      transition: 'background-color 250ms, outline 200ms',
      _before: {
        willChange: 'transform',
        content: '""',
        position: 'absolute',
        top: '3px',
        left: '4px',
        width: '1.125rem',
        height: '1.125rem',
        borderRadius: 'full',
        backgroundColor: 'content.semantic.contextual.primary',
        transition: 'transform 250ms, background-color 250ms',
      },
    },
    '& .checkmark, & .cross': {
      position: 'absolute',
      top: '3px',
      width: '1.125rem', // the handle
      height: '1.125rem',
      display: 'grid',
      placeItems: 'center',
      pointerEvents: 'none',
      zIndex: 1,
      '& svg': {
        display: 'block',
        width: '0.875rem',
        height: '0.875rem',
      },
    },
    '& .checkmark': {
      left: '24px', // handle offset (4px) + its travel (20px)
      color: 'content.semantic.brand.tertiary',
      opacity: 0,
    },
    '& .cross': {
      left: '4px',
      color: 'content.semantic.neutral.tertiary',
      opacity: 1,
      transition: 'opacity 100ms',
      transitionDelay: '180ms',
    },
    '&[data-selected] .indicator': {
      backgroundColor: 'content.semantic.brand.tertiary',
      _before: {
        transform: 'translateX(20px)',
      },
    },
    '&[data-selected] .checkmark': {
      opacity: 1,
      transition: 'opacity 100ms',
      transitionDelay: '180ms',
    },
    '&[data-selected] .cross': {
      opacity: 0,
      transition: 'opacity 10ms',
      transitionDelay: '0ms',
    },
    '&[data-disabled]': {
      cursor: 'not-allowed',
      color: 'content.semantic.disabled.primary',
    },
    '&[data-disabled] .indicator': {
      backgroundColor: 'content.semantic.disabled.primary',
      _before: {
        backgroundColor: 'content.semantic.disabled.secondary',
      },
    },
    '&[data-disabled] .checkmark, &[data-disabled] .cross': {
      color: 'content.semantic.disabled.primary',
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
            <RiCheckLine />
          </span>
          <span className="cross" aria-hidden="true">
            <RiCloseFill />
          </span>
        </div>
        {typeof children === 'function' ? children(renderProps) : children}
      </>
    )}
  </StyledSwitch>
)

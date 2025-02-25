import {
  type RadioProps as RACRadioProps,
  Radio as RACRadio,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { type StyledVariantProps } from '@/styled-system/types'

// styled taken from example at https://react-spectrum.adobe.com/react-aria/Checkbox.html and changed for round radios
export const StyledRadio = styled(RACRadio, {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.375,
    forcedColorAdjust: 'none',
    width: 'fit-content',
    '& .mt-Radio': {
      borderRadius: 'full',
      flexShrink: 0,
      width: '1.125rem',
      height: '1.125rem',
      border: '1px solid {colors.control.border}',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 200ms',
    },
    '& .mt-Radio-check': {
      width: '0.5rem',
      height: '0.5rem',
      borderRadius: 'full',
      backgroundColor: 'transparent',
      transition: 'all 200ms',
    },
    '&[data-pressed] .mt-Radio': {
      borderColor: 'primary.active',
    },
    '&[data-focus-visible] .mt-Radio': {
      outline: '2px solid!',
      outlineColor: 'focusRing!',
      outlineOffset: '2px!',
    },
    '&[data-selected] .mt-Radio': {
      borderColor: 'primary',
    },
    '&[data-selected] .mt-Radio-check': {
      backgroundColor: 'primary',
    },
    '&[data-selected][data-pressed] .mt-Radio-check': {
      backgroundColor: 'primary.active',
    },
  },
  variants: {
    size: {
      sm: {
        base: {},
        '& .radio': {
          width: '1.125rem',
          height: '1.125rem',
        },
        '& svg': {
          width: '0.625rem',
          height: '0.625rem',
        },
      },
    },
    alignment: {
      top: {
        alignItems: 'start',
        '& .mt-Radio': {
          marginTop: '3px',
        },
      },
    },
  },
})

export type RadioProps = StyledVariantProps<typeof StyledRadio> & RACRadioProps

/**
 * Styled radio button.
 *
 * Used internally by RadioGroups in Fields.
 */
export const Radio = ({ children, ...props }: RadioProps) => {
  return (
    <StyledRadio {...props}>
      {(renderProps) => (
        <>
          <div className="mt-Radio" aria-hidden="true">
            <div className="mt-Radio-check" />
          </div>
          {typeof children === 'function' ? children(renderProps) : children}
        </>
      )}
    </StyledRadio>
  )
}

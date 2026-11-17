import {
  type RadioProps as RACRadioProps,
  Radio as RACRadio,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { type StyledVariantProps } from '@/styled-system/types'

// Follows the radio of the UI kit, which shares the tokens of its checkbox.
const StyledRadio = styled(RACRadio, {
  base: {
    display: 'flex',
    // anchor the visually hidden input, so it scrolls with the radio
    position: 'relative',
    alignItems: 'center',
    gap: '2xs',
    forcedColorAdjust: 'none',
    width: 'fit-content',
    cursor: 'pointer',
    '& .mt-Radio': {
      borderRadius: 'full',
      flexShrink: 0,
      width: '1.5rem',
      height: '1.5rem',
      border: '1.5px solid',
      borderColor: 'content.semantic.neutral.tertiary',
      backgroundColor: 'background.surface.primary',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'border 250ms, box-shadow 250ms',
    },
    '& .mt-Radio-check': {
      width: '1rem',
      height: '1rem',
      borderRadius: 'full',
      backgroundColor: 'content.semantic.brand.tertiary',
      transform: 'scale(0)',
      transition: 'transform 250ms',
    },
    '&[data-hovered] .mt-Radio': {
      boxShadow: '0 0 0 1px {colors.content.semantic.neutral.tertiary}',
    },
    '&[data-focus-visible] .mt-Radio': {
      outline: '2px solid!',
      outlineColor: 'focusRing!',
      outlineOffset: '2px!',
    },
    '&[data-selected] .mt-Radio': {
      borderColor: 'content.semantic.brand.tertiary',
    },
    '&[data-selected][data-hovered] .mt-Radio': {
      boxShadow: '0 0 0 1px {colors.content.semantic.brand.tertiary}',
    },
    '&[data-selected] .mt-Radio-check': {
      transform: 'scale(1)',
    },
    '&[data-disabled]': {
      cursor: 'not-allowed',
    },
    '&[data-disabled] .mt-Radio': {
      borderColor: 'content.semantic.disabled.primary',
    },
    '&[data-disabled] .mt-Radio-check': {
      backgroundColor: 'content.semantic.disabled.primary',
    },
  },
  variants: {
    size: {
      sm: {
        '& .mt-Radio': {
          width: '1.125rem',
          height: '1.125rem',
        },
        '& .mt-Radio-check': {
          width: '0.625rem',
          height: '0.625rem',
        },
      },
    },
    alignment: {
      top: {
        alignItems: 'start',
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

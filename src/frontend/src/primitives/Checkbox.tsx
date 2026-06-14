import { type ReactNode, useId, useState } from 'react'
import {
  type CheckboxProps as RACCheckboxProps,
  Checkbox as RACCheckbox,
  CheckboxContext,
} from 'react-aria-components'
import { type StyledVariantProps } from '@/styled-system/types'
import { styled } from '@/styled-system/jsx'
import { FieldErrors } from './FieldErrors'
import { FieldDescription } from './FieldDescription'

// styled taken from example at https://react-spectrum.adobe.com/react-aria/Checkbox.html
const StyledCheckbox = styled(RACCheckbox, {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.375,
    forcedColorAdjust: 'none',
    width: 'fit-content',
    '& .mt-Checkbox-checkbox': {
      borderColor: 'control.border',
      flexShrink: 0,
      width: '1.375rem',
      height: '1.375rem',
      border: '1px solid',
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 200ms',
    },
    '& svg': {
      stroke: 'primary.text',
      width: '0.875rem',
      height: '0.875rem',
      flexShrink: 0,
      fill: 'none',
      strokeWidth: '3px',
      strokeDasharray: '22px',
      strokeDashoffset: '66',
      transition: 'all 200ms',
    },
    '&[data-pressed] .mt-Checkbox-checkbox': {
      borderColor: 'focusRing',
    },
    '&[data-focus-visible] .mt-Checkbox-checkbox': {
      outline: '2px solid!',
      outlineColor: 'focusRing!',
      outlineOffset: '2px!',
    },
    '&[data-selected] .mt-Checkbox-checkbox': {
      borderColor: 'primary',
      backgroundColor: 'primary',
    },
    '&[data-selected][data-pressed] .mt-Checkbox-checkbox': {
      borderColor: 'primary.active',
      backgroundColor: 'primary.active',
    },
    '&[data-selected] svg': {
      strokeDashoffset: '44',
    },
    '&[data-mt-checkbox-invalid="true"] .mt-Checkbox-checkbox': {
      borderColor: 'danger',
    },
    '&[data-selected][data-mt-checkbox-invalid="true"] .mt-Checkbox-checkbox': {
      backgroundColor: 'danger',
    },
  },
  variants: {
    size: {
      sm: {
        base: {},
        '& .mt-Checkbox-checkbox': {
          width: '1.125rem',
          height: '1.125rem',
        },
        '& svg': {
          width: '0.625rem',
          height: '0.625rem',
        },
      },
    },
  },
})

export type CheckboxProps = StyledVariantProps<typeof StyledCheckbox> &
  RACCheckboxProps & { description?: ReactNode }

/**
 * RAC Checkbox wrapper that adds support for description/error messages
 *
 * This is because description and error messages are not supported for
 * standalone checkboxes (see https://github.com/adobe/react-spectrum/issues/6192)
 *
 * We do some trickery to go around a few things so that we can trigger
 * the error message with the `validate` prop like other fields.
 *
 * Used internally by checkbox fields and checkbox group fields.
 *
 * note: this could be split in two components, one to render dumb, styled checkboxes,
 * like Input or Radio, and another to behave as an actual "CheckboxField", that
 * handles the error and description messages. No need for now though!
 */
export const Checkbox = ({
  isInvalid,
  description,
  children,
  ...props
}: CheckboxProps) => {
  const [error, setError] = useState<ReactNode | null>(null)
  const errorId = useId()
  const descriptionId = useId()

  if (isInvalid !== undefined) {
    console.error(
      'Checkbox: passing isInvalid is not supported, use the validate prop instead'
    )
    return null
  }

  return (
    <div>
      <CheckboxContext.Provider
        value={{
          'aria-describedby': [
            !!description && descriptionId,
            !!error && errorId,
          ]
            .filter(Boolean)
            .join(' '),
          // @ts-expect-error Any html attribute is actually valid
          'data-mt-checkbox-invalid': !!error,
        }}
      >
        <StyledCheckbox {...props}>
          {(renderProps) => {
            if (renderProps.isInvalid && !!props.validate) {
              setError(props.validate(renderProps.isSelected))
            } else {
              setError(null)
            }
            return (
              <>
                <div className="mt-Checkbox-checkbox">
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 18 18"
                    aria-hidden="true"
                    preserveAspectRatio="xMinYMin meet"
                  >
                    <polyline points="1 9 7 14 15 4" />
                  </svg>
                </div>
                <div>
                  {typeof children === 'function'
                    ? children(renderProps)
                    : children}
                </div>
              </>
            )
          }}
        </StyledCheckbox>
      </CheckboxContext.Provider>
      {!!description && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {!!error && <FieldErrors id={errorId} errors={[error]} />}
    </div>
  )
}

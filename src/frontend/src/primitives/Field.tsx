import { styled } from '@/styled-system/jsx'
import { type ReactNode } from 'react'
import {
  Label,
  TextField as RACTextField,
  FieldError as RACFieldError,
  CheckboxGroup,
  RadioGroup,
  type TextFieldProps,
  type CheckboxProps,
  type CheckboxGroupProps,
  type RadioGroupProps,
  type SelectProps,
} from 'react-aria-components'
import { FieldDescription } from './FieldDescription'
import { FieldErrors } from './FieldErrors'
import { Input } from './Input'
import { Radio } from './Radio'
import { Checkbox } from './Checkbox'
import { Select } from './Select'
import { Text } from './Text'
import { Div } from './Div'
import { Switch, type SwitchProps } from './Switch'
import { css } from '@/styled-system/css'

const FieldWrapper = styled('div', {
  base: {
    marginBottom: 'textfield',
    minWidth: 0,
  },
  variants: {
    noMargin: {
      true: {
        marginBottom: 0,
      },
    },
    fullWidth: {
      true: {
        width: '100%',
      },
    },
  },
})

const StyledLabel = styled(Label, {
  base: {
    display: 'block',
    fontSize: '0.875rem',
  },
  variants: {
    center: {
      true: {
        textAlign: 'center',
      },
    },
  },
})

type OmittedRACProps = 'type' | 'label' | 'items' | 'description' | 'validate'
type Items<T = ReactNode> = {
  items: Array<{ value: string; description?: string; label: T }>
}
type PartialTextFieldProps = Omit<TextFieldProps, OmittedRACProps>
type PartialCheckboxProps = Omit<CheckboxProps, OmittedRACProps>
type PartialCheckboxGroupProps = Omit<CheckboxGroupProps, OmittedRACProps>
type PartialRadioGroupProps = Omit<RadioGroupProps, OmittedRACProps>
type PartialSelectProps<T extends object> = Omit<
  SelectProps<T>,
  OmittedRACProps
>
type PartialSwitchProps = Omit<SwitchProps, OmittedRACProps>
type FieldProps<T extends object> = (
  | ({
      type: 'text'
      items?: never
      validate?: (
        value: string
      ) => ReactNode | ReactNode[] | true | null | undefined
    } & PartialTextFieldProps)
  | ({
      type: 'checkbox'
      validate?: (
        value: boolean
      ) => ReactNode | ReactNode[] | true | null | undefined
      items?: never
    } & PartialCheckboxProps)
  | ({
      type: 'checkboxGroup'
      validate?: (
        value: string[]
      ) => ReactNode | ReactNode[] | true | null | undefined
    } & Items &
      PartialCheckboxGroupProps)
  | ({
      type: 'radioGroup'
      validate?: (
        value: string | null
      ) => ReactNode | ReactNode[] | true | null | undefined
    } & Items &
      PartialRadioGroupProps)
  | ({
      type: 'select'
      validate?: (value: T) => ReactNode | ReactNode[] | true | null | undefined
    } & Items<string> &
      PartialSelectProps<T>)
  | ({
      type: 'switch'
      items?: never
      validate?: never
    } & PartialSwitchProps)
) & {
  label: string
  description?: string
  wrapperProps?: React.ComponentProps<typeof FieldWrapper>
  labelProps?: React.ComponentProps<typeof StyledLabel>
}

/**
 * Form field.
 *
 * This is the only component you should need when creating forms, besides the wrapping Form component.
 *
 * It has a specific type: a text input, a select, a checkbox, a checkbox group or a radio group.
 * It can have a `description`, a help text shown below the label.
 * On submit, it shows the errors that the `validate` prop returns based on the field value.
 * You can render React nodes as error messages if needed, but you usually return strings.
 *
 * You can directly pass HTML input props if needed (like required, pattern, etc)
 */
export const Field = <T extends object>({
  type,
  label,
  description,
  items,
  validate,
  ...props
}: FieldProps<T>) => {
  const LabelAndDescription = (
    <>
      <StyledLabel {...props.labelProps}>{label}</StyledLabel>
      {description ? (
        <FieldDescription slot="description">{description}</FieldDescription>
      ) : null}
    </>
  )
  const RACFieldErrors = (
    <RACFieldError>
      {({ validationErrors }) => {
        return <FieldErrors errors={validationErrors} />
      }}
    </RACFieldError>
  )

  if (type === 'text') {
    return (
      <FieldWrapper {...props.wrapperProps}>
        <RACTextField
          validate={validate as unknown as TextFieldProps['validate']}
          {...(props as PartialTextFieldProps)}
        >
          {LabelAndDescription}
          <Input />
          {RACFieldErrors}
        </RACTextField>
      </FieldWrapper>
    )
  }

  if (type === 'checkbox') {
    return (
      <FieldWrapper {...props.wrapperProps}>
        <Checkbox
          validate={validate as unknown as CheckboxProps['validate']}
          description={description}
          {...(props as PartialCheckboxProps)}
        >
          {label}
        </Checkbox>
      </FieldWrapper>
    )
  }

  if (type === 'checkboxGroup') {
    return (
      <FieldWrapper {...props.wrapperProps}>
        <CheckboxGroup
          validate={validate as unknown as CheckboxGroupProps['validate']}
          {...(props as PartialCheckboxGroupProps)}
        >
          {LabelAndDescription}
          <Div marginTop={0.25}>
            {items.map((item, index) => (
              <FieldItem last={index === items.length - 1} key={item.value}>
                <Checkbox size="sm" value={item.value}>
                  {item.label}
                </Checkbox>
              </FieldItem>
            ))}
          </Div>
          {RACFieldErrors}
        </CheckboxGroup>
      </FieldWrapper>
    )
  }

  if (type === 'radioGroup') {
    return (
      <FieldWrapper {...props.wrapperProps}>
        <RadioGroup
          validate={validate as unknown as RadioGroupProps['validate']}
          {...(props as PartialRadioGroupProps)}
        >
          {LabelAndDescription}
          {items.map((item, index) => (
            <FieldItem last={index === items.length - 1} key={item.value}>
              <Radio
                value={item.value}
                alignment={item.description ? 'top' : undefined}
              >
                <div
                  className={css({
                    display: 'flex',
                    flexDirection: 'column',
                  })}
                >
                  {item.label}
                  {item.description && (
                    <Text
                      variant="note"
                      wrap={'pretty'}
                      className={css({
                        textStyle: 'sm',
                        marginBottom: '0.5rem',
                      })}
                    >
                      {item.description}
                    </Text>
                  )}
                </div>
              </Radio>
            </FieldItem>
          ))}
          {RACFieldErrors}
        </RadioGroup>
      </FieldWrapper>
    )
  }

  if (type === 'select') {
    return (
      <FieldWrapper {...props.wrapperProps}>
        <Select
          validate={validate as unknown as SelectProps<T>['validate']}
          {...(props as PartialSelectProps<T>)}
          label={LabelAndDescription}
          errors={RACFieldErrors}
          items={items}
        />
      </FieldWrapper>
    )
  }

  if (type === 'switch') {
    const SWITCH_COMPONENT_WIDTH = '41px'
    return (
      <FieldWrapper {...props.wrapperProps}>
        <div
          className={css({
            display: 'flex',
            justifyContent: 'space-between',
          })}
        >
          {label}
          <Switch aria-label={label} {...(props as PartialSwitchProps)} />
        </div>
        {description && (
          <Text
            variant="note"
            wrap={'balance'}
            className={css({
              textStyle: 'sm',
              marginBottom: '0.5rem',
              marginRight: SWITCH_COMPONENT_WIDTH,
            })}
          >
            {description}
          </Text>
        )}
      </FieldWrapper>
    )
  }
}

const FieldItem = ({
  children,
  last,
}: {
  children: ReactNode
  last?: boolean
}) => {
  return <Div {...(!last ? { marginBottom: 0.25 } : {})}>{children}</Div>
}

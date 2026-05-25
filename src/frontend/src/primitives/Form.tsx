import { type FormEvent } from 'react'
import { Form as RACForm, type FormProps } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { HStack } from '@/styled-system/jsx'
import { useCloseDialog } from './useCloseDialog'
import { type ButtonProps, Button } from './Button'

/**
 * From wrapper that exposes form data on submit and adds submit/cancel buttons
 *
 * Wrap all your Fields in this component.
 * If the form is in a dialog, the cancel button closes the dialog unless you pass a custom onCancelButtonPress handler.
 */
export const Form = ({
  onSubmit,
  submitLabel,
  submitButtonProps,
  withCancelButton = true,
  onCancelButtonPress,
  children,
  ...props
}: Omit<FormProps, 'onSubmit'> & {
  onSubmit?: (
    data: {
      [k: string]: FormDataEntryValue
    },
    event: FormEvent<HTMLFormElement>
  ) => void
  submitLabel: string
  submitButtonProps?: ButtonProps
  withCancelButton?: boolean
  onCancelButtonPress?: () => void
}) => {
  const { t } = useTranslation()
  const closeDialog = useCloseDialog()
  const onCancel = withCancelButton
    ? onCancelButtonPress || closeDialog
    : undefined

  return (
    <RACForm
      {...props}
      onSubmit={(event) => {
        event.preventDefault()
        const formData = Object.fromEntries(new FormData(event.currentTarget))
        if (onSubmit) {
          onSubmit(formData, event)
        }
      }}
    >
      {children}
      <HStack gap="gutter">
        <Button type="submit" variant="primary" {...submitButtonProps}>
          {submitLabel}
        </Button>
        {!!onCancel && (
          <Button variant="secondary" onPress={() => onCancel()}>
            {t('cancel')}
          </Button>
        )}
      </HStack>
    </RACForm>
  )
}

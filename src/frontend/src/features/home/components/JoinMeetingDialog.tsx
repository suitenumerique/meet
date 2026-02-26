import { useTranslation } from 'react-i18next'
import { Field, Ul, H, P, Form, Dialog } from '@/primitives'
import { navigateTo } from '@/navigation/navigateTo'
import { isRoomValid } from '@/features/rooms'

export const JoinMeetingDialog = () => {
  const { t } = useTranslation('home')

  const handleSubmit = (data: { roomId?: FormDataEntryValue }) => {
    const roomId = (data.roomId as string)
      .trim()
      .replace(`${window.location.origin}/`, '')
    navigateTo('room', roomId)
  }

  const validateRoomId = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    return !isRoomValid(trimmed) ? (
      <>
        <p>{t('joinInputError')}</p>
        <Ul>
          <li>{window.location.origin}/uio-azer-jkl</li>
          <li>uio-azer-jkl</li>
        </Ul>
      </>
    ) : null
  }

  return (
    <Dialog title={t('joinMeeting')}>
      <Form onSubmit={handleSubmit} submitLabel={t('joinInputSubmit')}>
        {/* eslint-disable jsx-a11y/no-autofocus -- Focus on input when modal opens, required for accessibility */}
        <Field
          type="text"
          autoFocus
          isRequired
          name="roomId"
          label={t('joinInputLabel')}
          description={t('joinInputExample', {
            example: window.origin + '/azer-tyu-qsdf',
          })}
          validate={validateRoomId}
        />
      </Form>
      <H lvl={2}>{t('joinMeetingTipHeading')}</H>
      <P last>{t('joinMeetingTipContent')}</P>
    </Dialog>
  )
}

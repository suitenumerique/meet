import { useTranslation } from 'react-i18next'
import { Field, Ul, H, P, Form, Dialog } from '@/primitives'
import { navigateTo } from '@/navigation/navigateTo'
import { isRoomValid } from '@/features/rooms'

export const JoinMeetingDialog = () => {
  const { t } = useTranslation('home')
  return (
    <Dialog title={t('joinMeeting')}>
      <Form
        onSubmit={(data) => {
          navigateTo(
            'room',
            (data.roomId as string)
              .trim()
              .replace(`${window.location.origin}/`, '')
          )
        }}
        submitLabel={t('joinInputSubmit')}
      >
        <Field
          type="text"
          name="roomId"
          label={t('joinInputLabel')}
          description={t('joinInputExample', {
            example: window.origin + '/azer-tyu-qsdf',
          })}
          validate={(value) => {
            return !isRoomValid(value.trim()) ? (
              <>
                <p>{t('joinInputError')}</p>
                <Ul>
                  <li>{window.location.origin}/uio-azer-jkl</li>
                  <li>uio-azer-jkl</li>
                </Ul>
              </>
            ) : null
          }}
        />
      </Form>
      <H lvl={2}>{t('joinMeetingTipHeading')}</H>
      <P last>{t('joinMeetingTipContent')}</P>
    </Dialog>
  )
}

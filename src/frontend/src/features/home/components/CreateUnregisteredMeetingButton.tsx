import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'
import { navigateTo } from '@/navigation/navigateTo'
import { generateRoomId } from '@/features/rooms'

export const CreateUnregisteredMeetingButton = () => {
  const { t } = useTranslation('home')
  return (
    <Button
      variant="primary"
      data-attr="create-unregistered-meeting"
      onPress={() =>
        navigateTo('room', generateRoomId(), { state: { create: true } })
      }
    >
      {t('createMeeting')}
    </Button>
  )
}

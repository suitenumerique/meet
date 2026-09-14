import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'
import { navigateTo } from '@/navigation/navigateTo'
import { generateRoomId } from '@/features/rooms'

/**
 * Lets a signed-out visitor start a meeting, when the instance allows
 * unregistered rooms.
 *
 * No room is created through the API: `POST /rooms/` is reserved for registered
 * (persistent) rooms and requires authentication. Navigating to a fresh id is
 * enough — the backend materialises an ephemeral room on retrieval when
 * ALLOW_UNREGISTERED_ROOMS is on, which is exactly what happens today when
 * someone opens a meeting link they were given.
 *
 * `create` is carried in the navigation state so the room opens the invite
 * dialog, as it does for authenticated creators: someone who just started a
 * meeting needs the link to share before anything else.
 */
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

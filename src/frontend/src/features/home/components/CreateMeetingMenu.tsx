import { useTranslation } from 'react-i18next'
import { MenuItem, Menu as RACMenu } from 'react-aria-components'
import { Button, Menu } from '@/primitives'
import { navigateTo } from '@/navigation/navigateTo'
import { generateRoomId, useCreateRoom } from '@/features/rooms'
import { RiAddLine, RiLink } from '@remixicon/react'
import { LaterMeetingDialog } from '@/features/home/components/LaterMeetingDialog'
import { useState } from 'react'

import { menuRecipe } from '@/primitives/menuRecipe'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'

export const CreateMeetingMenu = () => {
  const { t } = useTranslation('home')
  const { mutateAsync: createRoom } = useCreateRoom()
  const [laterRoom, setLaterRoom] = useState<null | ApiRoom>(null)

  return (
    <>
      <Menu>
        <Button variant="primary" data-attr="create-meeting">
          {t('createMeeting')}
        </Button>
        <RACMenu>
          <MenuItem
            className={menuRecipe({ icon: true, variant: 'light' }).item}
            onAction={() => {
              const slug = generateRoomId()
              createRoom({ slug }).then((data) =>
                navigateTo('room', data.slug, {
                  state: { create: true },
                })
              )
            }}
            data-attr="create-option-instant"
          >
            <RiAddLine size={18} />
            {t('createMenu.instantOption')}
          </MenuItem>
          <MenuItem
            className={menuRecipe({ icon: true, variant: 'light' }).item}
            onAction={() => {
              const slug = generateRoomId()
              createRoom({ slug }).then(setLaterRoom)
            }}
            data-attr="create-option-later"
          >
            <RiLink size={18} />
            {t('createMenu.laterOption')}
          </MenuItem>
        </RACMenu>
      </Menu>
      <LaterMeetingDialog
        room={laterRoom}
        onOpenChange={() => setLaterRoom(null)}
      />
    </>
  )
}

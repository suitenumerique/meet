import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { generateRoomId, useCreateRoom } from '../../rooms'
import { useUser } from '@/features/auth'
import { Spinner } from '@/primitives/Spinner'
import { Button, Text } from '@/primitives'
import { VStack } from '@/styled-system/jsx'
import { CallbackIdHandler } from '../utils/CallbackIdHandler'
import { PopupWindow } from '../utils/PopupWindow'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { RiVideoOnLine } from '@remixicon/react'

const callbackIdHandler = new CallbackIdHandler()
const popupWindow = new PopupWindow()

export const CreatePopup = () => {
  const { isLoggedIn } = useUser({
    fetchUserOptions: { attemptSilent: false },
  })
  const { mutateAsync: createRoom } = useCreateRoom()
  const { t } = useTranslation('sdk', { keyPrefix: 'createPopup' })

  const callbackId = useMemo(() => callbackIdHandler.getOrCreate(), [])
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (isLoggedIn === false) {
      popupWindow.navigateToAuthentication()
    }
  }, [isLoggedIn])

  const handleCreate = async () => {
    setIsCreating(true)

    try {
      const slug = generateRoomId()
      const roomData = await createRoom({
        slug,
        encryptionMode: ApiEncryptionMode.NONE,
      })

      popupWindow.sendRoomData({ slug: roomData.slug }, () => {
        callbackIdHandler.clear()
        popupWindow.close()
      })
    } catch (error) {
      console.error('Failed to create meeting room:', error)
      setIsCreating(false)
    }
  }

  useEffect(() => {
    if (isLoggedIn && !isCreating && callbackId) {
      void handleCreate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn])

  if (!isLoggedIn || isCreating) {
    return (
      <div
        className={css({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          width: '100%',
        })}
      >
        <Spinner />
      </div>
    )
  }

  return (
    <div
      className={css({
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        width: '100%',
        padding: '2rem',
      })}
    >
      <VStack gap="0.75rem" alignItems="stretch" maxWidth="22rem" width="100%">
        <Text
          variant="sm"
          bold
          className={css({
            textAlign: 'center',
            fontSize: '1.1rem',
            marginBottom: '0.5rem',
          })}
        >
          {t('title')}
        </Text>
        <Button variant="primary" fullWidth onPress={handleCreate}>
          <RiVideoOnLine size={18} />
          {t('create')}
        </Button>
      </VStack>
    </div>
  )
}

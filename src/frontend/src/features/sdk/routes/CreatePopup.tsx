import { useTranslation } from 'react-i18next'
import { usePersistentUserChoices } from '@livekit/components-react'
import { useEffect, useMemo } from 'react'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { css } from '@/styled-system/css'
import { generateRoomId, useCreateRoom } from '../../rooms'
import { authUrl, useUser } from '@/features/auth'
import { Spinner } from '@/primitives/Spinner.tsx'
import { generateRandomId } from '../utils/generateRandomId'

const LOCAL_STORAGE_ID_KEY = 'callbackId'
const CALLBACK_ID_LENGTH = 50

export const CreatePopup = () => {
  const { isLoggedIn } = useUser()
  const { mutateAsync: createRoom } = useCreateRoom()

  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  const callbackId = useMemo(() => {
    const storedId = localStorage.getItem(LOCAL_STORAGE_ID_KEY)
    if (storedId) {
      return storedId
    }
    const newId = generateRandomId(CALLBACK_ID_LENGTH)
    localStorage.setItem(LOCAL_STORAGE_ID_KEY, newId)
    return newId
  }, [])

  const notifyParentWindow = (roomUrl, slug) => {
    if (!window.opener) {
      console.error('No parent window found')
      window.close()
      return
    }
    const roomData = {
      source: 'https://meet.127.0.0.1.nip.io/',
      url: roomUrl,
      slug,
    }

    window.opener.postMessage(roomData, '*')

    window.close()
    localStorage.removeItem(LOCAL_STORAGE_ID_KEY)
  }

  /**
   * Creates a new meeting room and notifies the parent window
   */
  const createMeetingRoom = async () => {
    try {
      const slug = generateRoomId()
      const roomData = await createRoom({
        slug,
        username,
        callbackId,
      })
      const roomUrl = getRouteUrl('room', roomData.slug)
      notifyParentWindow(roomUrl, slug)
    } catch (error) {
      console.error('Failed to create meeting room:', error)
    }
  }

  // Redirect to authentication if user is not logged in
  useEffect(() => {
    if (isLoggedIn === false) {
      // Notify parent window that authentication is needed
      window.opener.postMessage(
        {
          source: 'https://meet.127.0.0.1.nip.io/',
          status: 'UNAUTHENTICATED',
          callbackId: callbackId,
        },
        '*'
      )

      // redirection lose connection with the opener
      window.location.href = authUrl({ returnTo: window.location })
    }
  }, [isLoggedIn, callbackId])

  useEffect(() => {
    if (isLoggedIn && callbackId) {
      createMeetingRoom()
    }
  }, [isLoggedIn, callbackId])

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

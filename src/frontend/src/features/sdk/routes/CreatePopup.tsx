import { useEffect, useMemo } from 'react'
import { css } from '@/styled-system/css'
import { generateRoomId, useCreateRoom } from '../../rooms'
import { useUser } from '@/features/auth'
import { Spinner } from '@/primitives/Spinner'
import { CallbackIdHandler } from '../utils/CallbackIdHandler'
import { PopupWindow } from '../utils/PopupWindow'

const callbackIdHandler = new CallbackIdHandler()
const popupWindow = new PopupWindow()

export const CreatePopup = () => {
  const { isLoggedIn } = useUser({ fetchUserOptions: { attemptSilent: false } })
  const { mutateAsync: createRoom } = useCreateRoom()

  const callbackId = useMemo(() => callbackIdHandler.getOrCreate(), [])

  /**
   * Handle unauthenticated users by redirecting to login
   *
   * When redirecting to authentication, the window.location change breaks the connection
   * between this popup and its parent window. We need to send the callbackId to the parent
   * before redirecting so it can re-establish connection after authentication completes.
   * This prevents the popup from becoming orphaned and ensures state consistency.
   */
  useEffect(() => {
    if (isLoggedIn === false) {
      // redirection loses the connection to the manager
      // prevent it passing an async callback id
      popupWindow.sendCallbackId(callbackId, () => {
        popupWindow.navigateToAuthentication()
      })
    }
  }, [isLoggedIn, callbackId])

  /**
   * Automatically create meeting room once user is authenticated
   * This effect will trigger either immediately if the user is already logged in,
   * or after successful authentication and return to this popup
   */
  useEffect(() => {
    const createMeetingRoom = async () => {
      try {
        const slug = generateRoomId()
        const roomData = await createRoom({
          slug,
          callbackId,
        })
        // Send room data back to parent window and clean up resources
        popupWindow.sendRoomData(roomData, () => {
          callbackIdHandler.clear()
          popupWindow.close()
        })
      } catch (error) {
        console.error('Failed to create meeting room:', error)
      }
    }
    if (isLoggedIn && callbackId) {
      createMeetingRoom()
    }
  }, [isLoggedIn, callbackId, createRoom])

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

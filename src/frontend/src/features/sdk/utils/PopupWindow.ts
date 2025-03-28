import { authUrl } from '@/features/auth'
import { PopupMessageType, CallbackCreationRoomData } from './types'

export class PopupWindow {
  private sendMessageToManager(
    type: PopupMessageType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    callback?: () => void
  ) {
    if (!window.opener) {
      console.error('No manager window found')
      window.close()
      return
    }
    window.opener.postMessage(
      {
        source: window.location.origin,
        type,
        ...data,
      },
      window.location.origin
    )
    callback?.()
  }

  public sendRoomData(data: CallbackCreationRoomData, callback?: () => void) {
    this.sendMessageToManager(
      PopupMessageType.ROOM_DATA,
      { room: { slug: data.slug } },
      callback
    )
  }

  public sendCallbackId(callbackId: string, callback?: () => void) {
    this.sendMessageToManager(
      PopupMessageType.CALLBACK_ID,
      { callbackId },
      callback
    )
  }

  public close() {
    window.close()
  }

  public navigateToAuthentication() {
    window.location.href = authUrl({})
  }
}

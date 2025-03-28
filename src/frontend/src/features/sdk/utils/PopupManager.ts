import { getRouteUrl } from '@/navigation/getRouteUrl'
import {
  CallbackCreationRoomData,
  ClientMessageType,
  PopupMessageData,
  PopupMessageType,
} from './types'

export class PopupManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private messageHandler: (event: MessageEvent<any>) => void = () => {}

  public createPopupWindow(onFailure: () => void) {
    const popupWindow = window.open(
      `${window.location.origin}/sdk/create-popup`,
      'CreatePopupWindow',
      `status=no,location=no,toolbar=no,menubar=no,width=600,height=800,left=100,top=100, resizable=yes,scrollbars=yes`
    )

    if (popupWindow) {
      popupWindow.focus()
    } else {
      onFailure()
    }
  }

  public setupMessageListener(
    onCallbackId: (id: string) => void,
    onRoomData: (data: CallbackCreationRoomData) => void
  ) {
    this.messageHandler = (event) => {
      const data = event.data as PopupMessageData
      // Skip messages from untrusted sources
      if (data.source !== window.location.origin) return
      switch (data.type) {
        case PopupMessageType.CALLBACK_ID:
          onCallbackId(data.callbackId as string)
          return
        case PopupMessageType.ROOM_DATA:
          if (!data?.room) return
          onRoomData(data.room)
          window?.parent.postMessage(
            {
              type: ClientMessageType.ROOM_CREATED,
              data: {
                room: {
                  url: getRouteUrl('room', data.room.slug),
                  ...data.room,
                },
              },
            },
            '*'
          )
          return
      }
    }
    window.addEventListener('message', this.messageHandler)
  }

  public cleanup() {
    window.removeEventListener('message', this.messageHandler)
  }
}

import {
  CallbackCreationRoomData,
  ClientMessageType,
  PopupMessageData,
  PopupMessageType,
  SdkRoomData,
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

  public createSettingsPopupWindow(roomSlug: string, onFailure: () => void) {
    const popupWindow = window.open(
      `${window.location.origin}/sdk/settings-popup?slug=${encodeURIComponent(roomSlug)}`,
      'SettingsPopupWindow',
      `status=no,location=no,toolbar=no,menubar=no,width=600,height=800,left=100,top=100, resizable=yes,scrollbars=yes`
    )

    if (popupWindow) {
      popupWindow.focus()
    } else {
      onFailure()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private messageParent(type: ClientMessageType, data: any) {
    window?.parent.postMessage(
      {
        type: type,
        data: data,
      },
      '*'
    )
  }

  public clearState() {
    this.messageParent(ClientMessageType.STATE_CLEAR, {})
  }

  public sendRoomData(data: { room: SdkRoomData }) {
    this.messageParent(ClientMessageType.ROOM_CREATED, data)
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
          // The caller builds and sends ROOM_CREATED (it knows the telephony config)
          onRoomData(data.room)
          return
      }
    }
    window.addEventListener('message', this.messageHandler)
  }

  public cleanup() {
    window.removeEventListener('message', this.messageHandler)
  }
}

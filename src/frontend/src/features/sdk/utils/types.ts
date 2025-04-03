export type CallbackCreationRoomData = {
  slug: string
}

export enum ClientMessageType {
  ROOM_CREATED = 'ROOM_CREATED',
  STATE_CLEAR = 'STATE_CLEAR',
}

export interface PopupMessageData {
  type: PopupMessageType
  source: string
  callbackId?: string
  room?: CallbackCreationRoomData
}

export enum PopupMessageType {
  CALLBACK_ID,
  ROOM_DATA,
}

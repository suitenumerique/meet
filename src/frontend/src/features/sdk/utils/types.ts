export type CallbackCreationRoomData = {
  slug: string
  // Telephony PIN, only present when telephony is enabled
  pin_code?: string
}

/** Room payload posted to the SDK consumer with ROOM_CREATED. */
export type SdkRoomData = {
  slug: string
  url: string
  // Dial-in phone number (international format), with telephony enabled
  phone?: string
  // Room PIN code (digits only), to enter after dialing `phone`
  code?: string
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

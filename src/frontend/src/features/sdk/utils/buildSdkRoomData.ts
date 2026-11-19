import { getRouteUrl } from '@/navigation/getRouteUrl'
import { CallbackCreationRoomData, SdkRoomData } from './types'

export type SdkTelephony = {
  enabled: boolean
  internationalPhoneNumber?: string
}

/**
 * Build the ROOM_CREATED payload sent to the SDK consumer: link, plus the
 * dial-in number and PIN when telephony is enabled and both are known.
 */
export const buildSdkRoomData = (
  room: CallbackCreationRoomData,
  telephony?: SdkTelephony
): SdkRoomData => {
  const data: SdkRoomData = {
    slug: room.slug,
    url: getRouteUrl('room', room.slug),
  }
  if (
    telephony?.enabled &&
    telephony.internationalPhoneNumber &&
    room.pin_code
  ) {
    data.phone = telephony.internationalPhoneNumber
    data.code = room.pin_code
  }
  return data
}

import type { TFunction } from 'i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { formatRoomInfo } from '@/features/rooms/utils/telephony'
import { CallbackCreationRoomData, SdkRoomData } from './types'

export type SdkTelephony = {
  enabled: boolean
  internationalPhoneNumber?: string
}

/**
 * Build the ROOM_CREATED payload sent to the SDK consumer: link, plus the
 * dial-in number and PIN when telephony is enabled and both are known,
 * and the text of the copy button.
 */
export const buildSdkRoomData = (
  room: CallbackCreationRoomData,
  telephony: SdkTelephony | undefined,
  t: TFunction<'global', 'clipboardContent'>
): SdkRoomData => {
  const url = getRouteUrl('room', room.slug)
  const data: SdkRoomData = { slug: room.slug, url, displayText: url }
  if (
    telephony?.enabled &&
    telephony.internationalPhoneNumber &&
    room.pin_code
  ) {
    data.phone = telephony.internationalPhoneNumber
    data.code = room.pin_code
    data.displayText = formatRoomInfo(t, {
      roomUrl: url,
      phoneNumber: data.phone,
      pinCode: data.code,
    })
  }
  return data
}

import type { TFunction } from 'i18next'

export function formatPinCode(pinCode?: string) {
  return pinCode && `${pinCode.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}#`
}

export function formatRoomInfo(
  t: TFunction<'global', 'clipboardContent'>,
  {
    roomUrl,
    phoneNumber,
    pinCode,
  }: { roomUrl: string; phoneNumber?: string; pinCode?: string }
) {
  if (!phoneNumber || !pinCode) return roomUrl

  return [
    t('url', { roomUrl }),
    t('numberAndPin', { phoneNumber, pinCode: formatPinCode(pinCode) }),
  ].join('\n')
}

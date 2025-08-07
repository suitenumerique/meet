import { useTelephony } from './useTelephony'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { formatPinCode } from '@/features/rooms/utils/telephony'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { getRouteUrl } from '@/navigation/getRouteUrl'

const COPY_SUCCESS_TIMEOUT = 3000

export const useCopyRoomToClipboard = (room: ApiRoom | undefined) => {
  const telephony = useTelephony()
  const { t } = useTranslation('global', { keyPrefix: 'clipboardContent' })

  const [isCopied, setIsCopied] = useState(false)
  const [isRoomUrlCopied, setIsRoomUrlCopied] = useState(false)

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), COPY_SUCCESS_TIMEOUT)
      return () => clearTimeout(timeout)
    }
  }, [isCopied])

  useEffect(() => {
    if (isRoomUrlCopied) {
      const timeout = setTimeout(
        () => setIsRoomUrlCopied(false),
        COPY_SUCCESS_TIMEOUT
      )
      return () => clearTimeout(timeout)
    }
  }, [isRoomUrlCopied])

  const roomUrl = useMemo(() => {
    return room?.slug ? getRouteUrl('room', room.slug) : ''
  }, [room?.slug])

  const hasTelephonyInfo = useMemo(() => {
    return telephony.enabled && room?.pin_code
  }, [telephony.enabled, room?.pin_code])

  const content = useMemo(() => {
    if (!roomUrl || !room) return ''
    if (!hasTelephonyInfo) return roomUrl

    return [
      t('url', { roomUrl }),
      t('numberAndPin', {
        phoneNumber: telephony?.internationalPhoneNumber,
        pinCode: formatPinCode(room.pin_code),
      }),
    ].join('\n')
  }, [roomUrl, hasTelephonyInfo, telephony, room, t])

  const copyRoomToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setIsCopied(true)
    } catch (error) {
      console.error(error)
    }
  }

  const copyRoomUrlToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl)
      setIsRoomUrlCopied(true)
    } catch (error) {
      console.error(error)
    }
  }

  return {
    isCopied,
    copyRoomToClipboard,
    isRoomUrlCopied,
    copyRoomUrlToClipboard,
  }
}

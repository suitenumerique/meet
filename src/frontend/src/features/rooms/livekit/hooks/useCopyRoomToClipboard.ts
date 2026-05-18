import { useTelephony } from './useTelephony'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { formatPinCode } from '@/features/rooms/utils/telephony'
import { ApiRoom, ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { getRouteUrl } from '@/navigation/getRouteUrl'

const COPY_SUCCESS_TIMEOUT = 3000

export const useCopyRoomToClipboard = (
  room: ApiRoom | undefined,
  hashOverride?: string
) => {
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
    if (!room?.slug) return ''
    const base = getRouteUrl('room', room.slug)
    // In basic encrypted mode, the passphrase is in the URL hash
    const hash = hashOverride ? `#${hashOverride}` : window.location.hash
    return hash ? `${base}${hash}` : base
  }, [room?.slug, hashOverride])

  // Encrypted rooms never get a dispatch rule on the SIP gateway side
  // (the backend skips it because no PIN-driven join can ever decrypt),
  // so make sure we don't paste a non-functional phone+PIN snippet either.
  const hasTelephonyInfo = useMemo(() => {
    return (
      telephony.enabled &&
      room?.pin_code &&
      room?.encryption_mode !== ApiEncryptionMode.BASIC
    )
  }, [telephony.enabled, room?.pin_code, room?.encryption_mode])

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

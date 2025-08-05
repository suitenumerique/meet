import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { Bold, Button, Div, Text } from '@/primitives'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { useRoomData } from '../hooks/useRoomData'
import { formatPinCode } from '../../utils/telephony'
import { useTelephony } from '../hooks/useTelephony'

export const Info = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'info' })

  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), 3000)
      return () => clearTimeout(timeout)
    }
  }, [isCopied])

  const data = useRoomData()
  const roomUrl = getRouteUrl('room', data?.slug)

  const telephony = useTelephony()

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && data?.pin_code
  }, [telephony?.enabled, data?.pin_code])

  const clipboardContent = useMemo(() => {
    if (isTelephonyReadyForUse) {
      return [
        t('roomInformation.clipboard.url', { roomUrl }),
        t('roomInformation.clipboard.numberAndPin', {
          phoneNumber: telephony?.internationalPhoneNumber,
          pinCode: formatPinCode(data?.pin_code),
        }),
      ].join('\n')
    }
    return roomUrl
  }, [
    isTelephonyReadyForUse,
    roomUrl,
    telephony?.internationalPhoneNumber,
    data?.pin_code,
    t,
  ])

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
    >
      <VStack alignItems="start">
        <Text
          as="h3"
          className={css({
            display: 'flex',
            alignItems: 'center',
          })}
        >
          {t('roomInformation.title')}
        </Text>
        <div
          className={css({
            gap: '0.15rem',
            display: 'flex',
            flexDirection: 'column',
          })}
        >
          <Text as="p" variant="xsNote" wrap="pretty">
            {roomUrl.replace(/^https?:\/\//, '')}
          </Text>
          {isTelephonyReadyForUse && (
            <>
              <Text as="p" variant="xsNote" wrap="pretty">
                <Bold>{t('roomInformation.phone.call')}</Bold> (
                {telephony?.country}) {telephony?.internationalPhoneNumber}
              </Text>
              <Text as="p" variant="xsNote" wrap="pretty">
                <Bold>{t('roomInformation.phone.pinCode')}</Bold>{' '}
                {formatPinCode(data?.pin_code)}
              </Text>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant={isCopied ? 'success' : 'tertiaryText'}
          aria-label={t('roomInformation.button.ariaLabel')}
          onPress={() => {
            navigator.clipboard.writeText(clipboardContent)
            setIsCopied(true)
          }}
          data-attr="copy-info-sidepannel"
          style={{
            marginLeft: '-8px',
          }}
        >
          {isCopied ? (
            <>
              <RiCheckLine size={24} style={{ marginRight: '6px' }} />
              {t('roomInformation.button.copied')}
            </>
          ) : (
            <>
              <RiFileCopyLine size={24} style={{ marginRight: '6px' }} />
              {t('roomInformation.button.copy')}
            </>
          )}
        </Button>
      </VStack>
    </Div>
  )
}

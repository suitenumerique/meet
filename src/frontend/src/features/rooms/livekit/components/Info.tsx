import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { Bold, Button, Div, Text } from '@/primitives'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { useRoomData } from '../hooks/useRoomData'
import { formatPinCode } from '../../utils/telephony'
import { useTelephony } from '../hooks/useTelephony'
import { useCopyRoomToClipboard } from '../hooks/useCopyRoomToClipboard'

export const Info = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'info' })

  const data = useRoomData()
  const roomUrl = data?.slug ? getRouteUrl('room', data.slug) : ''

  const telephony = useTelephony()

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && data?.pin_code
  }, [telephony?.enabled, data?.pin_code])

  const { isCopied, copyRoomToClipboard } = useCopyRoomToClipboard(data)

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
    >
      <VStack alignItems="stretch" width="full">
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
            padding: '0.5rem 0.625rem',
            borderRadius: '4px',
            backgroundColor: 'background.semantic.neutral.tertiary',
          })}
        >
          <Text as="p" variant="smNote" wrap="pretty">
            {roomUrl.replace(/^https?:\/\//, '')}
          </Text>
          {isTelephonyReadyForUse && (
            <>
              <Text as="p" variant="smNote" wrap="pretty">
                <Bold>{t('roomInformation.phone.call')}</Bold> (
                {telephony?.country}) {telephony?.internationalPhoneNumber}
              </Text>
              <Text as="p" variant="smNote" wrap="pretty">
                <Bold>{t('roomInformation.phone.pinCode')}</Bold>{' '}
                {formatPinCode(data?.pin_code)}
              </Text>
            </>
          )}
        </div>
        <Button
          fullWidth
          variant={isCopied ? 'success' : 'bordered'}
          aria-label={t('roomInformation.button.ariaLabel')}
          onPress={copyRoomToClipboard}
          data-attr="copy-info-sidepannel"
        >
          {isCopied ? (
            <>
              <RiCheckLine
                size={24}
                style={{ marginRight: '6px' }}
                aria-hidden="true"
              />
              {t('roomInformation.button.copied')}
            </>
          ) : (
            <>
              <RiFileCopyLine
                size={24}
                style={{ marginRight: '6px' }}
                aria-hidden="true"
              />
              {t('roomInformation.button.copy')}
            </>
          )}
        </Button>
      </VStack>
    </Div>
  )
}

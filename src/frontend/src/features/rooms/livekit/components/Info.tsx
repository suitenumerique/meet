import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import {
  RiAlertFill,
  RiCheckLine,
  RiComputerLine,
  RiFileCopyLine,
  RiPhoneLine,
} from '@remixicon/react'
import { Bold, Button, Div, Text } from '@/primitives'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { useRoomData } from '../hooks/useRoomData'
import { formatPinCode } from '../../utils/telephony'
import { useTelephony } from '../hooks/useTelephony'
import { useCopyRoomToClipboard } from '../hooks/useCopyRoomToClipboard'
import { FeaturePill } from '@/features/encryption'

export const Info = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'info' })
  const { t: tHome } = useTranslation('home', {
    keyPrefix: 'connectionDetailsDialog',
  })

  const data = useRoomData()
  const baseRoomUrl = getRouteUrl('room', data?.slug)
  const roomUrl = window.location.hash
    ? `${baseRoomUrl}${window.location.hash}`
    : baseRoomUrl

  const telephony = useTelephony()
  const isEncrypted = data?.encryption_mode === 'basic'
  const isAdminOrOwner = !!data?.is_administrable

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && data?.pin_code && !isEncrypted
  }, [telephony?.enabled, data?.pin_code, isEncrypted])

  const { isCopied, copyRoomToClipboard } = useCopyRoomToClipboard(data)

  if (isEncrypted && !isAdminOrOwner) {
    return (
      <Div
        display="flex"
        overflowY="scroll"
        padding="0 1.5rem"
        flexGrow={1}
        flexDirection="column"
        alignItems="start"
      >
        <Text as="p" variant="note" wrap="pretty">
          {t('encrypted.guestBody')}
        </Text>
      </Div>
    )
  }

  if (isEncrypted) {
    return (
      <Div
        display="flex"
        overflowY="scroll"
        padding="0 1.5rem"
        flexGrow={1}
        flexDirection="column"
        alignItems="start"
      >
        <VStack
          alignItems="stretch"
          gap="0.75rem"
          className={css({ width: '100%' })}
        >
          <div
            role="alert"
            className={css({
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.6rem 0.85rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fff7ed',
              border: '1px solid #fed7aa',
              color: '#7c2d12',
            })}
          >
            <RiAlertFill
              size={18}
              color="#b45309"
              className={css({ flexShrink: 0 })}
            />
            <Text
              variant="sm"
              margin={false}
              className={css({
                color: '#7c2d12',
                fontSize: '0.85rem',
                lineHeight: 1.4,
              })}
            >
              {tHome('warning')}
            </Text>
          </div>
          <Text as="p" variant="note" margin={false}>
            <Bold>{t('encrypted.linkLabel')}</Bold>
          </Text>
          <div
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: 'greyscale.250',
            })}
          >
            <span
              className={css({
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                wordBreak: 'break-all',
              })}
            >
              {roomUrl.replace(/^https?:\/\//, '')}
            </span>
            <Button
              square
              size="sm"
              variant={isCopied ? 'success' : 'tertiaryText'}
              onPress={copyRoomToClipboard}
              aria-label={
                isCopied
                  ? t('roomInformation.button.copied')
                  : t('roomInformation.button.copy')
              }
              tooltip={
                isCopied
                  ? t('roomInformation.button.copied')
                  : t('roomInformation.button.copy')
              }
              data-attr="copy-info-sidepannel"
            >
              {isCopied ? (
                <RiCheckLine size={16} />
              ) : (
                <RiFileCopyLine size={16} />
              )}
            </Button>
          </div>
          <Text
            as="p"
            margin={false}
            className={css({
              fontSize: '12px',
              fontWeight: 400,
              color: 'greyscale.500',
            })}
          >
            {t('encrypted.disabledHeading')}
          </Text>
          <div
            className={css({
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
            })}
          >
            <FeaturePill
              icon={<RiPhoneLine size={14} />}
              label={t('encrypted.features.dialIn')}
            />
            <FeaturePill
              icon={<RiComputerLine size={14} />}
              label={t('encrypted.features.meetingRoom')}
            />
          </div>
        </VStack>
      </Div>
    )
  }

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
          <Text
            as="p"
            variant="xsNote"
            className={css({
              wordBreak: 'break-all',
              whiteSpace: 'normal',
            })}
          >
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
          onPress={copyRoomToClipboard}
          data-attr="copy-info-sidepannel"
          style={{
            marginLeft: '-8px',
          }}
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

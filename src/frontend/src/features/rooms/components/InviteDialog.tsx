import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Div, Button, type DialogProps, P, Bold } from '@/primitives'
import { HStack, styled, VStack } from '@/styled-system/jsx'
import { Heading, Dialog } from 'react-aria-components'
import { Text, text } from '@/primitives/Text'
import {
  RiCheckLine,
  RiCloseLine,
  RiFileCopyLine,
  RiSpam2Fill,
} from '@remixicon/react'
import { useMemo } from 'react'
import { css } from '@/styled-system/css'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { useTelephony } from '@/features/rooms/livekit/hooks/useTelephony'
import { formatPinCode } from '@/features/rooms/utils/telephony'
import { useCopyRoomToClipboard } from '@/features/rooms/livekit/hooks/useCopyRoomToClipboard'

// fixme - extract in a proper primitive this dialog without overlay
const StyledRACDialog = styled(Dialog, {
  base: {
    position: 'fixed',
    left: '0.75rem',
    bottom: 80,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    width: '24.5rem',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow:
      '0 1px 2px 0 rgba(60, 64, 67, .3), 0 2px 6px 2px rgba(60, 64, 67, .15)',
    backgroundColor: 'white',
    '&[data-entering]': { animation: 'fade 200ms' },
    '&[data-exiting]': { animation: 'fade 150ms reverse ease-in' },
  },
})

export const InviteDialog = (props: Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'shareDialog' })

  const roomData = useRoomData()
  const roomUrl = getRouteUrl('room', roomData?.slug)

  const telephony = useTelephony()

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && roomData?.pin_code
  }, [telephony?.enabled, roomData?.pin_code])

  const {
    isCopied,
    copyRoomToClipboard,
    isRoomUrlCopied,
    copyRoomUrlToClipboard,
  } = useCopyRoomToClipboard(roomData)

  return (
    <StyledRACDialog {...props}>
      {({ close }) => (
        <VStack
          alignItems="left"
          justify="start"
          gap={0}
          style={{ maxWidth: '100%', overflow: 'hidden' }}
        >
          <Heading slot="title" level={3} className={text({ variant: 'h2' })}>
            {t('heading')}
          </Heading>
          <Div position="absolute" top="5" right="5">
            <Button
              invisible
              variant="tertiaryText"
              size="xs"
              onPress={() => {
                props.onClose?.()
                close()
              }}
              aria-label={t('closeDialog')}
            >
              <RiCloseLine />
            </Button>
          </Div>
          <P>{t('description')}</P>
          {isTelephonyReadyForUse ? (
            <div
              className={css({
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                marginTop: '0.5rem',
                gap: '1rem',
                overflow: 'hidden',
              })}
            >
              <div
                className={css({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                })}
              >
                <Text as="p" wrap="pretty">
                  {roomUrl?.replace(/^https?:\/\//, '')}
                </Text>
                {isTelephonyReadyForUse && roomUrl && (
                  <Button
                    variant={isRoomUrlCopied ? 'success' : 'tertiaryText'}
                    square
                    size={'sm'}
                    onPress={copyRoomUrlToClipboard}
                    aria-label={t('copyUrl')}
                    tooltip={t('copyUrl')}
                  >
                    {isRoomUrlCopied ? <RiCheckLine /> : <RiFileCopyLine />}
                  </Button>
                )}
              </div>
              <div
                className={css({
                  display: 'flex',
                  flexDirection: 'column',
                })}
              >
                <Text as="p" wrap="pretty">
                  <Bold>{t('phone.call')}</Bold> ({telephony?.country}){' '}
                  {telephony?.internationalPhoneNumber}
                </Text>
                <Text as="p" wrap="pretty">
                  <Bold>{t('phone.pinCode')}</Bold>{' '}
                  {formatPinCode(roomData?.pin_code)}
                </Text>
              </div>
              <Button
                variant={isCopied ? 'success' : 'secondaryText'}
                size="sm"
                fullWidth
                aria-label={t('copy')}
                style={{
                  justifyContent: 'start',
                }}
                onPress={copyRoomToClipboard}
                data-attr="share-dialog-copy"
              >
                {isCopied ? (
                  <>
                    <RiCheckLine size={18} style={{ marginRight: '8px' }} />
                    {t('copied')}
                  </>
                ) : (
                  <>
                    <RiFileCopyLine
                      style={{ marginRight: '6px', minWidth: '18px' }}
                    />
                    {t('copy')}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant={isCopied ? 'success' : 'tertiary'}
              fullWidth
              aria-label={t('copy')}
              onPress={copyRoomToClipboard}
              data-attr="share-dialog-copy"
            >
              {isCopied ? (
                <>
                  <RiCheckLine size={24} style={{ marginRight: '8px' }} />
                  {t('copied')}
                </>
              ) : (
                <>
                  <RiFileCopyLine size={24} style={{ marginRight: '8px' }} />
                  {t('copyUrl')}
                </>
              )}
            </Button>
          )}
          {roomData?.access_level === ApiAccessLevel.PUBLIC && (
            <HStack>
              <div
                className={css({
                  backgroundColor: 'primary.200',
                  borderRadius: '50%',
                  padding: '4px',
                  marginTop: '1rem',
                })}
              >
                <RiSpam2Fill
                  size={22}
                  className={css({
                    fill: 'primary.500',
                  })}
                />
              </div>
              <Text variant="sm" style={{ marginTop: '1rem' }}>
                {t('permissions')}
              </Text>
            </HStack>
          )}
        </VStack>
      )}
    </StyledRACDialog>
  )
}

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Bold, Button, Dialog, type DialogProps, P, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { RiCheckLine, RiFileCopyLine, RiSpam2Fill } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { ApiAccessLevel, ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useTelephony } from '@/features/rooms/livekit/hooks/useTelephony'
import { formatPinCode } from '@/features/rooms/utils/telephony'
import { useCopyRoomToClipboard } from '@/features/rooms/livekit/hooks/useCopyRoomToClipboard'

// fixme - duplication with the InviteDialog
export const LaterMeetingDialog = ({
  room,
  ...dialogProps
}: { room: null | ApiRoom } & Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('home', { keyPrefix: 'laterMeetingDialog' })

  const roomUrl = room && getRouteUrl('room', room?.slug)
  const telephony = useTelephony()

  const [isHovered, setIsHovered] = useState(false)

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && room?.pin_code
  }, [telephony?.enabled, room?.pin_code])

  const {
    isCopied,
    copyRoomToClipboard,
    isRoomUrlCopied,
    copyRoomUrlToClipboard,
  } = useCopyRoomToClipboard(room || undefined)

  return (
    <Dialog isOpen={!!room} {...dialogProps} title={t('heading')}>
      <P>{t('description')}</P>
      {!!roomUrl && (
        <>
          {isTelephonyReadyForUse ? (
            <div
              className={css({
                width: '100%',
                backgroundColor: 'gray.50',
                borderRadius: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                padding: '1.75rem 1.5rem',
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
                {isTelephonyReadyForUse && (
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
                  {formatPinCode(room?.pin_code)}
                </Text>
              </div>
              <Button
                variant={isCopied ? 'success' : 'tertiaryText'}
                size="sm"
                fullWidth
                aria-label={t('copy')}
                style={{
                  justifyContent: 'start',
                }}
                onPress={copyRoomToClipboard}
                data-attr="later-dialog-copy"
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
              variant={isCopied ? 'success' : 'primary'}
              size="sm"
              fullWidth
              aria-label={t('copy')}
              style={{
                justifyContent: 'start',
              }}
              onPress={copyRoomToClipboard}
              onHoverChange={setIsHovered}
              data-attr="later-dialog-copy"
            >
              {isCopied ? (
                <>
                  <RiCheckLine size={18} style={{ marginRight: '8px' }} />
                  {t('copied')}
                </>
              ) : (
                <>
                  <RiFileCopyLine
                    size={18}
                    style={{ marginRight: '8px', minWidth: '18px' }}
                  />
                  {isHovered ? (
                    t('copy')
                  ) : (
                    <div
                      style={{
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        userSelect: 'none',
                        textWrap: 'nowrap',
                      }}
                    >
                      {roomUrl?.replace(/^https?:\/\//, '')}
                    </div>
                  )}
                </>
              )}
            </Button>
          )}
          {room?.access_level == ApiAccessLevel.PUBLIC && (
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
        </>
      )}
    </Dialog>
  )
}

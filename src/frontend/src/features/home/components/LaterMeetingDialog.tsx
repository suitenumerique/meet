import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Bold, Button, Dialog, type DialogProps, P, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { RiCheckLine, RiFileCopyLine, RiSpam2Fill } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useTelephony } from '@/features/rooms/livekit/hooks/useTelephony'
import { formatPinCode } from '@/features/rooms/utils/telephony'

// fixme - duplication with the InviteDialog
export const LaterMeetingDialog = ({
  room,
  ...dialogProps
}: { room: null | ApiRoom } & Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('home', { keyPrefix: 'laterMeetingDialog' })

  const roomUrl = room && getRouteUrl('room', room?.slug)
  const telephony = useTelephony()

  const [isCopied, setIsCopied] = useState(false)
  const [isRoomUrlCopied, setIsRoomUrlCopied] = useState(false)

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), 3000)
      return () => clearTimeout(timeout)
    }
  }, [isCopied])

  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (isRoomUrlCopied) {
      const timeout = setTimeout(() => setIsRoomUrlCopied(false), 3000)
      return () => clearTimeout(timeout)
    }
  }, [isRoomUrlCopied])

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && room?.pin_code
  }, [telephony?.enabled, room?.pin_code])

  const clipboardContent = useMemo(() => {
    if (isTelephonyReadyForUse) {
      return [
        t('clipboard.url', { roomUrl }),
        t('clipboard.numberAndPin', {
          phoneNumber: telephony?.internationalPhoneNumber,
          pinCode: formatPinCode(room?.pin_code),
        }),
      ].join('\n')
    }
    return roomUrl
  }, [
    isTelephonyReadyForUse,
    roomUrl,
    telephony?.internationalPhoneNumber,
    room?.pin_code,
    t,
  ])

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
                    onPress={() => {
                      navigator.clipboard.writeText(roomUrl)
                      setIsRoomUrlCopied(true)
                    }}
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
              {clipboardContent && (
                <Button
                  variant={isCopied ? 'success' : 'tertiaryText'}
                  size="sm"
                  fullWidth
                  aria-label={t('copy')}
                  style={{
                    justifyContent: 'start',
                  }}
                  onPress={() => {
                    navigator.clipboard.writeText(clipboardContent)
                    setIsCopied(true)
                  }}
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
              )}
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
              onPress={() => {
                navigator.clipboard.writeText(roomUrl)
                setIsCopied(true)
              }}
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
        </>
      )}
    </Dialog>
  )
}

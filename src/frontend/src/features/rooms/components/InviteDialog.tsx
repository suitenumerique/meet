import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Div, Button, type DialogProps, P, Bold } from '@/primitives'
import { HStack, styled, VStack } from '@/styled-system/jsx'
import { Heading, Dialog } from 'react-aria-components'
import { Text, text } from '@/primitives/Text'
import {
  RiAlertFill,
  RiCheckLine,
  RiCloseLine,
  RiComputerLine,
  RiFileCopyLine,
  RiPhoneLine,
  RiSpam2Fill,
} from '@remixicon/react'
import { useMemo } from 'react'
import { css } from '@/styled-system/css'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { FeaturePill } from '@/features/encryption'
import { ApiAccessLevel, ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
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
  const { t: tHome } = useTranslation('home', {
    keyPrefix: 'connectionDetailsDialog',
  })
  const { t: tFeatures } = useTranslation('home', {
    keyPrefix: 'createEncryptedMeetingDialog',
  })

  const roomData = useRoomData()
  const isEncrypted = roomData?.encryption_mode === ApiEncryptionMode.BASIC
  const isAdminOrOwner = !!roomData?.is_administrable
  const baseRoomUrl = getRouteUrl('room', roomData?.slug)
  // Include the hash (passphrase) for basic encrypted rooms so the full link is visible
  const roomUrl = window.location.hash
    ? `${baseRoomUrl}${window.location.hash}`
    : baseRoomUrl

  const telephony = useTelephony()

  // Encrypted rooms never get a working PIN (backend skips both pin_code
  // and dispatch_rule allocation), so the phone block must stay hidden
  // even if a stale pin_code somehow slipped through.
  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && roomData?.pin_code && !isEncrypted
  }, [telephony?.enabled, roomData?.pin_code, isEncrypted])

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
          style={{ maxWidth: '100%', overflow: 'visible' }}
        >
          <Heading slot="title" level={2} className={text({ variant: 'h2' })}>
            {isEncrypted ? t('encryptedHeading') : t('heading')}
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
          {isEncrypted && !isAdminOrOwner ? (
            <P>{t('encryptedGuestBody')}</P>
          ) : (
            <P>{t('description')}</P>
          )}
          {(() => {
            if (isEncrypted && !isAdminOrOwner) return null
            if (isEncrypted) {
              return (
                <div
                  className={css({
                    width: '100%',
                    marginTop: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  })}
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
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      })}
                    >
                      {roomUrl?.replace(/^https?:\/\//, '')}
                    </span>
                    <Button
                      variant={isRoomUrlCopied ? 'success' : 'tertiaryText'}
                      square
                      size="sm"
                      onPress={copyRoomUrlToClipboard}
                      aria-label={isRoomUrlCopied ? t('copied') : t('copyUrl')}
                      tooltip={isRoomUrlCopied ? t('copied') : t('copyUrl')}
                    >
                      {isRoomUrlCopied ? (
                        <RiCheckLine size={16} />
                      ) : (
                        <RiFileCopyLine size={16} />
                      )}
                    </Button>
                  </div>
                  <Text
                    margin={false}
                    className={css({
                      fontSize: '12px',
                      fontWeight: 400,
                      color: 'greyscale.500',
                    })}
                  >
                    {t('encryptedDisabledHeading')}
                  </Text>
                  <div
                    className={css({
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                    })}
                  >
                    <FeaturePill
                      size="sm"
                      icon={<RiPhoneLine size={13} />}
                      label={tFeatures('features.dialIn')}
                    />
                    <FeaturePill
                      size="sm"
                      icon={<RiComputerLine size={13} />}
                      label={tFeatures('features.meetingRoom')}
                    />
                  </div>
                </div>
              )
            }
            if (isTelephonyReadyForUse) {
              return (
                <div
                  className={css({
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    marginTop: '0.5rem',
                    gap: '1rem',
                    overflow: 'visible',
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
                        aria-label={
                          isRoomUrlCopied ? t('copied') : t('copyUrl')
                        }
                        tooltip={isRoomUrlCopied ? t('copied') : t('copyUrl')}
                      >
                        {isRoomUrlCopied ? (
                          <RiCheckLine aria-hidden="true" />
                        ) : (
                          <RiFileCopyLine aria-hidden="true" />
                        )}
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
                    aria-label={isCopied ? t('copied') : t('copy')}
                    style={{
                      justifyContent: 'start',
                    }}
                    onPress={copyRoomToClipboard}
                    data-attr="share-dialog-copy"
                  >
                    {isCopied ? (
                      <>
                        <RiCheckLine
                          size={18}
                          style={{ marginRight: '8px' }}
                          aria-hidden="true"
                        />
                        {t('copied')}
                      </>
                    ) : (
                      <>
                        <RiFileCopyLine
                          style={{ marginRight: '6px', minWidth: '18px' }}
                          aria-hidden="true"
                        />
                        {t('copy')}
                      </>
                    )}
                  </Button>
                </div>
              )
            }
            return (
              <Button
                variant={isCopied ? 'success' : 'tertiary'}
                fullWidth
                aria-label={isCopied ? t('copied') : t('copy')}
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
            )
          })()}
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

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { Button, Dialog, type DialogProps, P, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { RiCheckLine, RiFileCopyLine, RiSpam2Fill } from '@remixicon/react'
import { css } from '@/styled-system/css'

// fixme - duplication with the InviteDialog
export const LaterMeetingDialog = ({
  roomId,
  ...dialogProps
}: { roomId: string } & Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('home')
  const roomUrl = getRouteUrl('room', roomId)

  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), 3000)
      return () => clearTimeout(timeout)
    }
  }, [isCopied])

  const [isHovered, setIsHovered] = useState(false)

  return (
    <Dialog
      isOpen={!!roomId}
      {...dialogProps}
      title={t('laterMeetingDialog.heading')}
    >
      <P>{t('laterMeetingDialog.description')}</P>
      <Button
        variant={isCopied ? 'success' : 'primary'}
        size="sm"
        fullWidth
        aria-label={t('laterMeetingDialog.copy')}
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
            {t('laterMeetingDialog.copied')}
          </>
        ) : (
          <>
            <RiFileCopyLine
              size={18}
              style={{ marginRight: '8px', minWidth: '18px' }}
            />
            {isHovered ? (
              t('laterMeetingDialog.copy')
            ) : (
              <div
                style={{
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  userSelect: 'none',
                  textWrap: 'nowrap',
                }}
              >
                {roomUrl.replace(/^https?:\/\//, '')}
              </div>
            )}
          </>
        )}
      </Button>
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
          {t('laterMeetingDialog.permissions')}
        </Text>
      </HStack>
    </Dialog>
  )
}

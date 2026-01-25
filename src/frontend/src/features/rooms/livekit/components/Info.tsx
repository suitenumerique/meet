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
import { useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useSidePanelRef } from '../hooks/useSidePanelRef'
import { useSidePanelTriggers } from '../hooks/useSidePanelTriggers'

export const Info = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'info' })
  const { isInfoOpen } = useSidePanel()
  const panelRef = useSidePanelRef()
  const { getTrigger } = useSidePanelTriggers()

  const data = useRoomData()
  const roomUrl = getRouteUrl('room', data?.slug)

  const telephony = useTelephony()

  const isTelephonyReadyForUse = useMemo(() => {
    return telephony?.enabled && data?.pin_code
  }, [telephony?.enabled, data?.pin_code])

  const { isCopied, copyRoomToClipboard } = useCopyRoomToClipboard(data)

  // Restore focus to the element that opened the Info panel
  useRestoreFocus(isInfoOpen, {
    resolveTrigger: (activeEl) => getTrigger('info') ?? activeEl,
    // Focus the first focusable element when the panel opens
    onOpened: () => {
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (panel) {
          const firstButton = panel.querySelector<HTMLElement>(
            '[data-attr="copy-info-sidepanel"]'
          )
          if (firstButton) {
            firstButton.focus({ preventScroll: true })
          }
        }
      })
    },
    restoreFocusRaf: true,
    preventScroll: true,
  })

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
          onPress={copyRoomToClipboard}
          data-attr="copy-info-sidepanel"
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

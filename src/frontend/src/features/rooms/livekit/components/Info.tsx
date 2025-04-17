import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { Button, Div, Text } from '@/primitives'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { useRoomData } from '../hooks/useRoomData'

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
        <Text as="p" variant="xsNote" wrap="pretty">
          {roomUrl}
        </Text>
        <Button
          size="sm"
          variant={isCopied ? 'success' : 'tertiaryText'}
          aria-label={t('roomInformation.button.ariaLabel')}
          onPress={() => {
            navigator.clipboard.writeText(roomUrl)
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

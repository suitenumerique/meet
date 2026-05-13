import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog } from '@/primitives'
import { Checkbox } from '@/primitives/Checkbox'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { RiAlertFill, RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'

interface Props {
  room: ApiRoom | null
  hash: string
  onOpenChange: (open: boolean) => void
  onStart: () => void
}

export const ConnectionDetailsDialog = ({
  room,
  hash,
  onOpenChange,
  onStart,
}: Props) => {
  const { t } = useTranslation('home', { keyPrefix: 'connectionDetailsDialog' })
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!room) return null

  const url = `${getRouteUrl('room', room.slug)}#${hash}`
  const displayUrl = url.replace(/^https?:\/\//, '')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('copy failed', err)
    }
  }

  return (
    <Dialog
      isOpen={!!room}
      onOpenChange={onOpenChange}
      title={t('title')}
      role="dialog"
    >
      <p
        className={css({
          fontSize: '0.9rem',
          color: 'greyscale.700',
          marginBottom: '1rem',
        })}
      >
        {t('description')}
      </p>
      <div
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 0.9rem',
          borderRadius: '0.5rem',
          border: '1px solid',
          borderColor: 'greyscale.250',
          backgroundColor: 'white',
          marginBottom: '1rem',
        })}
      >
        <span
          className={css({
            flexGrow: 1,
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          })}
        >
          {displayUrl}
        </span>
        <Button
          variant={copied ? 'success' : 'tertiaryText'}
          square
          size="sm"
          onPress={copy}
          aria-label={t('copy')}
          tooltip={t('copy')}
        >
          {copied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
        </Button>
      </div>
      <div
        className={css({
          display: 'flex',
          gap: '0.5rem',
          padding: '0.75rem 0.9rem',
          borderRadius: '0.5rem',
          backgroundColor: '#fff7ed',
          border: '1px solid #fed7aa',
          marginBottom: '1rem',
          alignItems: 'flex-start',
        })}
      >
        <RiAlertFill
          size={18}
          color="#b45309"
          className={css({ flexShrink: 0 })}
        />
        <div className={css({ flex: 1 })}>
          <p
            className={css({
              fontSize: '0.85rem',
              color: '#7c2d12',
              lineHeight: 1.4,
              marginBottom: '0.5rem',
            })}
          >
            {t('warning')}
          </p>
          <Checkbox
            isSelected={acknowledged}
            onChange={setAcknowledged}
            className={css({
              fontSize: '0.9rem',
              color: '#7c2d12',
            })}
          >
            {t('iUnderstand')}
          </Checkbox>
        </div>
      </div>
      <HStack gap="0.5rem" justify="flex-end">
        <Button
          variant="primary"
          isDisabled={!acknowledged}
          onPress={onStart}
          data-attr="encrypted-start"
        >
          {t('startMeeting')}
        </Button>
      </HStack>
    </Dialog>
  )
}

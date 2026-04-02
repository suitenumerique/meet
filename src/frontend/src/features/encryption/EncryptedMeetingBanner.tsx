/**
 * Indicator shown at the top-left of an encrypted meeting.
 *
 * Initially shows the full label "End-to-end encrypted" with a lock icon.
 * After a few seconds, collapses to just the lock icon.
 * On hover, expands back with a smooth animation.
 * Clicking opens a modal explaining what E2EE means and its limitations.
 */
import { css } from '@/styled-system/css'
import { VStack } from '@/styled-system/jsx'
import { RiLockFill, RiShieldCheckFill } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isEncryptedRoom } from '@/features/rooms/api/ApiRoom'
import { useVaultClient } from './VaultClientProvider'
import { useEffect, useState } from 'react'
import { Dialog, Text } from '@/primitives'

const COLLAPSE_DELAY = 4000

export function EncryptedMeetingBanner() {
  const roomData = useRoomData()
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption' })
  const { hasKeys } = useVaultClient()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Strong = admin has encryption onboarding (can sign key exchange)
  // Standard = admin is only ProConnect (ephemeral key exchange, trusts server)
  const isStrongEncryption = hasKeys === true

  useEffect(() => {
    const timer = setTimeout(() => setIsCollapsed(true), COLLAPSE_DELAY)
    return () => clearTimeout(timer)
  }, [])

  if (!isEncryptedRoom(roomData)) return null

  const bgColor = isStrongEncryption ? '#166534' : '#1e3a5f'
  const hoverBgColor = isStrongEncryption ? '#15803d' : '#2563eb'
  const icon = isStrongEncryption
    ? <RiShieldCheckFill size={13} color="white" className={css({ flexShrink: 0 })} />
    : <RiLockFill size={13} color="white" className={css({ flexShrink: 0 })} />
  const label = isStrongEncryption ? t('bannerStrong') : t('banner')

  return (
    <>
      <div
        onMouseEnter={() => setIsCollapsed(false)}
        onMouseLeave={() => setIsCollapsed(true)}
        onClick={() => setIsModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsModalOpen(true)}
        aria-label={label}
        className={css({
          position: 'absolute',
          top: '0.5rem',
          left: '0.5rem',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.3rem 0.6rem',
          borderRadius: '1rem',
          border: '2px solid rgba(0, 0, 0, 0.3)',
          cursor: 'pointer',
          overflow: 'hidden',
          transition: 'all 300ms ease',
          maxWidth: isCollapsed ? '2.2rem' : '16rem',
          whiteSpace: 'nowrap',
        })}
        style={{
          backgroundColor: bgColor,
          paddingRight: isCollapsed ? '0.3rem' : '0.6rem',
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = hoverBgColor }}
        onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = bgColor }}
      >
        {icon}
        <span
          className={css({
            fontSize: '0.7rem',
            fontWeight: 600,
            color: 'white',
            letterSpacing: '0.02em',
            transition: 'opacity 200ms ease',
          })}
          style={{
            opacity: isCollapsed ? 0 : 1,
          }}
        >
          {label}
        </span>
      </div>

      <Dialog
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        role="dialog"
        type="flex"
        title={t('bannerModal.title')}
      >
        <VStack
          gap="1rem"
          alignItems="start"
          className={css({ maxWidth: '24rem' })}
        >
          <Text variant="sm">{t('bannerModal.description')}</Text>

          <VStack gap="0.5rem" alignItems="start" className={css({ width: '100%' })}>
            <Text variant="sm" className={css({ fontWeight: 600 })}>
              {t('bannerModal.guarantees')}
            </Text>
            <ul
              className={css({
                paddingLeft: '1.5rem',
                fontSize: '0.85rem',
                listStyleType: 'disc',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                '& li': {
                  paddingLeft: '0.25rem',
                },
                '& li::marker': {
                  color: '#22c55e',
                },
              })}
            >
              <li>{t('bannerModal.guarantee1')}</li>
              <li>{t('bannerModal.guarantee2')}</li>
              <li>{t('bannerModal.guarantee3')}</li>
            </ul>
          </VStack>

          <VStack gap="0.5rem" alignItems="start" className={css({ width: '100%' })}>
            <Text variant="sm" className={css({ fontWeight: 600 })}>
              {t('bannerModal.limitations')}
            </Text>
            <ul
              className={css({
                paddingLeft: '1.5rem',
                fontSize: '0.85rem',
                listStyleType: 'disc',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                '& li': {
                  paddingLeft: '0.25rem',
                },
                '& li::marker': {
                  color: '#f59e0b',
                },
              })}
            >
              <li>{t('bannerModal.limitation1')}</li>
              <li>{t('bannerModal.limitation2')}</li>
            </ul>
          </VStack>

          <Text
            variant="note"
            className={css({
              fontSize: '0.75rem',
              borderTop: '1px solid',
              borderColor: 'greyscale.200',
              paddingTop: '0.75rem',
              width: '100%',
            })}
          >
            {t('bannerModal.note')}
          </Text>
        </VStack>
      </Dialog>
    </>
  )
}

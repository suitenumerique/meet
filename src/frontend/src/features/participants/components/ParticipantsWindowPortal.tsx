import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { UNSAFE_PortalProvider } from '@react-aria/overlays'
import { RiArrowGoBackLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { CrossDocumentOverlaysContext } from '@/primitives/CrossDocumentOverlaysContext'
import { ParticipantsList } from './ParticipantsList'

export const ParticipantsWindowPortal = ({
  container,
  onReturn,
}: {
  container: HTMLElement | null
  onReturn: () => void
}) => {
  const { t } = useTranslation('rooms')
  useEffect(() => {
    if (!container?.isConnected) return
    const focusId = requestAnimationFrame(() => {
      container
        .querySelector<HTMLElement>('[data-attr="participants-return"]')
        ?.focus({
          preventScroll: true,
        })
    })
    return () => cancelAnimationFrame(focusId)
  }, [container])
  if (!container?.isConnected) return null

  return createPortal(
    <UNSAFE_PortalProvider getContainer={() => container}>
      <CrossDocumentOverlaysContext.Provider value={true}>
        <section
          className={css({
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            backgroundColor: 'box.bg',
            color: 'box.text',
          })}
          aria-label={t('sidePanel.heading.participants')}
        >
          <header
            className={css({
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid',
              borderColor: 'box.border',
            })}
          >
            <h1 className={css({ fontSize: '1.125rem', fontWeight: 'bold' })}>
              {t('sidePanel.heading.participants')}
            </h1>
            <Button
              size="sm"
              variant="tertiaryText"
              data-attr="participants-return"
              onPress={onReturn}
              aria-label={t('sidePanel.returnParticipants')}
              tooltip={t('sidePanel.returnParticipants')}
            >
              <RiArrowGoBackLine aria-hidden="true" />
            </Button>
          </header>
          <div className={css({ display: 'flex', flex: 1, minHeight: 0 })}>
            <ParticipantsList />
          </div>
        </section>
      </CrossDocumentOverlaysContext.Provider>
    </UNSAFE_PortalProvider>,
    container
  )
}

import { Participant } from 'livekit-client'
import { css } from '@/styled-system/css'
import { useParticipantAttribute } from '@livekit/components-react'
import { RiErrorWarningFill } from '@remixicon/react'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'
import { useTranslation } from 'react-i18next'

export const UnauthenticatedBadge = ({
  participant,
}: {
  participant: Participant
}) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'participants.unauthenticated',
  })
  const is_authenticated = useParticipantAttribute('is_authenticated', {
    participant,
  })

  if (is_authenticated == 'true') return

  return (
    <div
      className={css({
        height: '18px',
        width: '18px',
        borderRadius: '100%',
        background: 'orange.200',
        color: 'orange.800',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: '-2px',
        right: '-4px',
      })}
    >
      <VisualOnlyTooltip tooltip={t('badge')}>
        <RiErrorWarningFill size={14} aria-hidden />
      </VisualOnlyTooltip>
    </div>
  )
}

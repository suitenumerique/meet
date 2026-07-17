import React from 'react'
import { useTranslation } from 'react-i18next'
import { useRemoteParticipants } from '@livekit/components-react'
import { srOnly } from '@/styles/a11y'
import { css } from '@/styled-system/css'
import { RiInfinityLine } from '@remixicon/react'

const badgeStyles = css({
  position: 'absolute',
  top: '-.25rem',
  right: '-.25rem',
  width: '1.25rem',
  height: '1.25rem',
  backgroundColor: 'gray',
  borderRadius: '50%',
  color: 'white',
  fontSize: '0.75rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  zIndex: 1,
  userSelect: 'none',
})

/**
 * Isolated so participant join/leave events only re-render the badge,
 * not the button, tooltip or shortcut registration.
 */
export const ParticipantsCount = React.memo(
  ({ describedById }: { describedById: string }) => {
    const { t } = useTranslation('rooms', {
      keyPrefix: 'controls.participants',
    })
    const remoteParticipants = useRemoteParticipants({
      updateOnlyOn: [],
    })
    const count = (remoteParticipants?.length ?? 0) + 1

    return (
      <>
        <span id={describedById} className={srOnly}>
          {t('count', { count })}
        </span>
        <div className={badgeStyles} aria-hidden>
          {count < 100 ? count : <RiInfinityLine size={10} />}
        </div>
      </>
    )
  }
)
ParticipantsCount.displayName = 'ParticipantsCount'

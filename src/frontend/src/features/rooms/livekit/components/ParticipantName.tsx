import type { CSSProperties } from 'react'
import { Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useParticipantInfo } from '@livekit/components-react'
import { Participant } from 'livekit-client'

const participantNameStyles: CSSProperties = {
  paddingBottom: '0.1rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const participantNameScreenShareStyles: CSSProperties = {
  ...participantNameStyles,
  marginLeft: '0.4rem',
}

export const ParticipantName = ({
  participant,
  isScreenShare = false,
}: {
  participant: Participant
  isScreenShare: boolean
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTile' })

  const { identity, name } = useParticipantInfo({ participant })
  const displayedName = name != '' ? name : identity

  if (isScreenShare) {
    return (
      <Text variant="sm" style={participantNameScreenShareStyles}>
        {t('screenShare', { name: displayedName })}
      </Text>
    )
  }

  return (
    <Text variant="sm" style={participantNameStyles} aria-hidden="true">
      {displayedName}
    </Text>
  )
}

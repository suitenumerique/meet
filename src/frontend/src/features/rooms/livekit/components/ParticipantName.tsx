import { Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useParticipantInfo } from '@livekit/components-react'
import { Participant } from 'livekit-client'

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
      <Text
        variant="sm"
        style={{
          paddingBottom: '0.1rem',
          marginLeft: '0.4rem',
        }}
      >
        {t('screenShare', { name: displayedName })}
      </Text>
    )
  }

  return (
    <Text
      variant="sm"
      style={{
        paddingBottom: '0.1rem',
      }}
      aria-hidden="true"
    >
      {displayedName}
    </Text>
  )
}

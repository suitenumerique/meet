import React, { CSSProperties } from 'react'
import { Text } from '@/primitives'
import { useTranslation } from 'react-i18next'

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

export const ParticipantName = React.memo(
  ({
    displayedName,
    isScreenShare = false,
  }: {
    displayedName?: string
    isScreenShare: boolean
  }) => {
    const { t } = useTranslation('rooms', { keyPrefix: 'participantTile' })
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
)

ParticipantName.displayName = 'ParticipantName'

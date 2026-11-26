import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'
import { Track } from 'livekit-client'
import Source = Track.Source

import { ParticipantTile } from '@/features/participantTile/components/ParticipantTile.tsx'
import { type ToastProps } from './Toast'
import { Div } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { ToastCard } from './ToastCard'
import { setPinnedTrack } from '@/stores/layout'
import { useParticipantTracks } from '@livekit/components-react'

export function ToastJoined({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const participant = props.toast.content.participant

  const [cameraTrack] = useParticipantTracks(
    [Source.Camera],
    participant?.identity
  )

  const trackReference = useMemo(
    () => cameraTrack ?? { participant, source: Source.Camera },
    [cameraTrack, participant]
  )

  if (!participant) return

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      titleProps={titleProps}
      onPress={(e) => {
        setPinnedTrack(trackReference)
        closeButtonProps.onPress?.(e)
      }}
      media={
        <Div
          display="flex"
          overflow="hidden"
          flexShrink={0}
          width="96"
          height="54"
          // up to the edges of the notification
          margin="-8px 0 -8px -8px"
        >
          <ParticipantTile
            trackRef={trackReference}
            disableSpeakingIndicator={true}
            disableMetadata={true}
            style={{
              borderRadius: 0,
              width: '100%',
            }}
          />
        </Div>
      }
    >
      {t('joined.description', {
        name: participant.name || t('defaultName'),
      })}
    </ToastCard>
  )
}

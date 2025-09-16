import { Div, ToggleButton } from '@/primitives'
import { RiArrowUpLine, RiCloseFill, RiRectangleLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useTrackToggle, UseTrackToggleProps } from '@livekit/components-react'
import { Track } from 'livekit-client'
import React from 'react'
import { type ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { TrackSource } from '@livekit/protocol'
import { useCanPublishTrack } from '@/features/rooms/livekit/hooks/useCanPublishTrack'

type Props = Omit<
  UseTrackToggleProps<Track.Source.ScreenShare>,
  'source' | 'captureOptions'
> &
  Pick<NonNullable<ButtonRecipeProps>, 'variant'> &
  ToggleButtonProps

export const ScreenShareToggle = ({
  variant = 'primaryDark',
  onPress,
  ...props
}: Props) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.screenShare' })
  const { buttonProps, enabled } = useTrackToggle({
    ...props,
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: 'include' },
  })

  const tooltipLabel = enabled ? 'stop' : 'start'
  const Icon = enabled ? RiCloseFill : RiArrowUpLine

  const canShareScreen = useCanPublishTrack(TrackSource.SCREEN_SHARE)

  // fixme - remove ToggleButton custom styles when we design a proper icon
  return (
    <ToggleButton
      isSelected={enabled}
      isDisabled={!canShareScreen}
      square
      variant={variant}
      aria-label={t(tooltipLabel)}
      tooltip={t(tooltipLabel)}
      onPress={(e) => {
        buttonProps.onClick?.(
          e as unknown as React.MouseEvent<HTMLButtonElement, MouseEvent>
        )
        onPress?.(e)
      }}
      data-attr={`controls-screenshare-${tooltipLabel}`}
      {...props}
    >
      <Div position="relative">
        <RiRectangleLine size={24} />
        <Icon
          size={14}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </Div>
    </ToggleButton>
  )
}

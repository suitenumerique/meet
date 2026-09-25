import { supportsScreenSharing } from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import type { ControlBarAuxProps } from './ControlBar'
import React, { useLayoutEffect, useRef, useState } from 'react'
import { css } from '@/styled-system/css'
import { LeaveButton } from '../../components/controls/LeaveButton'
import { Track } from 'livekit-client'
import { HandToggle } from '../../components/controls/HandToggle'
import { Button } from '@/primitives/Button'
import {
  RiAccountBoxLine,
  RiMegaphoneLine,
  RiMore2Line,
  RiSettings3Line,
} from '@remixicon/react'
import { ScreenShareToggle } from '../../components/controls/ScreenShareToggle'
import { ChatToggle } from '../../components/controls/ChatToggle'
import { ParticipantsToggle } from '../../components/controls/ParticipantsToggle'
import { useSidePanel } from '../../hooks/useSidePanel'
import { LinkButton } from '@/primitives'
import { ResponsiveMenu } from './ResponsiveMenu'
import { ToolsToggle } from '../../components/controls/ToolsToggle'
import { CameraSwitchButton } from '../../components/controls/CameraSwitchButton'
import { useConfig } from '@/api/useConfig'
import { AudioDevicesControl } from '../../components/controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from '../../components/controls/Device/VideoDeviceControl'
import { openSettingsDialog } from '@/stores/settings'
import { ControlBarRegion } from '@/features/layout/components/ControlBarRegion'
import {
  ReactionsToggle,
  reactionShortcutHandler,
} from '@/features/reactions/components/ReactionsToggle'
import { useSize } from '../../hooks/useResizeObserver'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useRoomContext } from '@livekit/components-react'

// Hand collapses first, then reactions; hidden toggles move into the menu.
const COLLAPSIBLE_COUNT = 2

// Layout-neutral measuring wrapper: inherits the region's gap and refuses to
// flex-shrink so measured widths are natural content widths.
const measuredRow = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'inherit',
  flexShrink: 0,
})

export function MobileControlBar({
  onDeviceError,
}: Readonly<ControlBarAuxProps>) {
  const { t } = useTranslation('rooms')
  const [isMenuOpened, setIsMenuOpened] = React.useState(false)
  const browserSupportsScreenSharing = supportsScreenSharing()
  const { toggleEffects } = useSidePanel()

  const containerRef = useRef<HTMLDivElement>(null)
  const { width } = useSize(containerRef)
  const barRef = useRef<HTMLDivElement>(null)
  const { width: barWidth } = useSize(barRef)
  const collapsibleRef = useRef<HTMLDivElement>(null)
  const { width: collapsibleWidth } = useSize(collapsibleRef)

  const [hiddenCount, setHiddenCount] = useState(0)
  const calibration = useRef<{ essential: number; slot: number }>()

  useLayoutEffect(() => {
    if (hiddenCount === 0 && collapsibleWidth > 0 && barRef.current) {
      const gap = parseFloat(getComputedStyle(barRef.current).columnGap) || 0
      calibration.current = {
        essential: barWidth - collapsibleWidth - gap,
        slot: (collapsibleWidth + gap) / COLLAPSIBLE_COUNT,
      }
    }
    if (!calibration.current || width <= 0) return
    const { essential, slot } = calibration.current
    const fits = Math.floor((width - essential) / slot)
    const next = Math.min(
      COLLAPSIBLE_COUNT,
      Math.max(0, COLLAPSIBLE_COUNT - fits)
    )
    if (next !== hiddenCount) setHiddenCount(next)
  }, [barWidth, collapsibleWidth, hiddenCount, width, setHiddenCount])

  const hideHand = hiddenCount >= 1
  const hideReactions = hiddenCount >= 2

  const room = useRoomContext()
  const { toggleRaisedHand } = useRaisedHand({
    participant: room.localParticipant,
  })
  useRegisterKeyboardShortcut({
    id: 'raise-hand',
    handler: toggleRaisedHand,
  })
  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: reactionShortcutHandler,
  })

  const { data } = useConfig()

  const closeMenu = () => setIsMenuOpened(false)

  return (
    <>
      <div
        className={css({
          width: '100vw',
          padding: '1.125rem',
        })}
      >
        <div
          ref={containerRef}
          className={css({
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
          })}
        >
          <ControlBarRegion mobile>
            <div ref={barRef} className={measuredRow}>
              <LeaveButton />
              <AudioDevicesControl
                onDeviceError={(error) =>
                  onDeviceError?.({ source: Track.Source.Microphone, error })
                }
                hideMenu={true}
              />
              <VideoDeviceControl
                onDeviceError={(error) =>
                  onDeviceError?.({ source: Track.Source.Camera, error })
                }
                hideMenu={true}
              />
              {/* Unmounted when empty so it doesn't leave a stray gap. */}
              {!hideReactions && (
                <div ref={collapsibleRef} className={measuredRow}>
                  <ReactionsToggle />
                  {!hideHand && <HandToggle />}
                </div>
              )}
              <Button
                id="room-options-trigger"
                square
                variant="primaryDark"
                aria-label={t('options.buttonLabel')}
                tooltip={t('options.buttonLabel')}
                onPress={() => setIsMenuOpened(true)}
              >
                <RiMore2Line />
              </Button>
            </div>
          </ControlBarRegion>
        </div>
      </div>
      <ResponsiveMenu isOpened={isMenuOpened} onClosed={closeMenu}>
        <div
          className={css({
            display: 'flex',
            justifyContent: 'center',
          })}
        >
          <div
            className={css({
              flexGrow: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gridGap: '1rem',
              '& > *': {
                alignSelf: 'center',
                justifySelf: 'center',
              },
            })}
          >
            {hideReactions && (
              <ReactionsToggle
                variant="primaryTextDark"
                description={true}
                onPress={closeMenu}
              />
            )}
            {hideHand && (
              <HandToggle
                variant="primaryTextDark"
                description={true}
                onPress={closeMenu}
              />
            )}
            {browserSupportsScreenSharing && (
              <ScreenShareToggle
                onDeviceError={(error) =>
                  onDeviceError?.({ source: Track.Source.ScreenShare, error })
                }
                variant="primaryTextDark"
                description={true}
                onPress={closeMenu}
              />
            )}
            <ChatToggle description={true} onPress={closeMenu} />
            <ParticipantsToggle description={true} onPress={closeMenu} />
            <ToolsToggle description={true} onPress={closeMenu} />
            <Button
              onPress={() => {
                toggleEffects()
                closeMenu()
              }}
              variant="primaryTextDark"
              aria-label={t('options.items.effects')}
              tooltip={t('options.items.effects')}
              description={true}
            >
              <RiAccountBoxLine size={20} />
            </Button>
            {data?.feedback?.url && (
              <LinkButton
                href={data?.feedback?.url}
                variant="primaryTextDark"
                tooltip={t('options.items.feedback')}
                aria-label={t('options.items.feedback')}
                description={true}
                target="_blank"
                onPress={closeMenu}
              >
                <RiMegaphoneLine size={20} />
              </LinkButton>
            )}
            <Button
              onPress={() => {
                openSettingsDialog()
                closeMenu()
              }}
              variant="primaryTextDark"
              aria-label={t('options.items.settings')}
              tooltip={t('options.items.settings')}
              description={true}
            >
              <RiSettings3Line size={20} />
            </Button>
            <CameraSwitchButton onPress={closeMenu} />
          </div>
        </div>
      </ResponsiveMenu>
    </>
  )
}

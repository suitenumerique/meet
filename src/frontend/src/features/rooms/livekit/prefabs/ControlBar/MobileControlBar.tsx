import { supportsScreenSharing } from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import { ControlBarAuxProps } from './ControlBar'
import React from 'react'
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
import { ParticipantsToggle } from '../../components/controls/Participants/ParticipantsToggle'
import { useSidePanel } from '../../hooks/useSidePanel'
import { LinkButton } from '@/primitives'
import { ResponsiveMenu } from './ResponsiveMenu'
import { ToolsToggle } from '../../components/controls/ToolsToggle'
import { CameraSwitchButton } from '../../components/controls/CameraSwitchButton'
import { useConfig } from '@/api/useConfig'
import { AudioDevicesControl } from '../../components/controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from '../../components/controls/Device/VideoDeviceControl'
import { useSettingsDialog } from '@/features/settings/hook/useSettingsDialog'

export function MobileControlBar({
  onDeviceError,
}: Readonly<ControlBarAuxProps>) {
  const { t } = useTranslation('rooms')
  const [isMenuOpened, setIsMenuOpened] = React.useState(false)
  const browserSupportsScreenSharing = supportsScreenSharing()
  const { toggleEffects } = useSidePanel()
  const { openSettingsDialog } = useSettingsDialog()

  const { data } = useConfig()

  return (
    <>
      <div
        className={css({
          width: '100vw',
          display: 'flex',
          position: 'absolute',
          padding: '1.125rem',
          justifyContent: 'center',
          bottom: 0,
          left: 0,
          right: 0,
        })}
      >
        <div
          className={css({
            display: 'flex',
            justifyContent: 'space-between',
            width: '330px',
          })}
        >
          <LeaveButton />
          <AudioDevicesControl
            onDeviceError={(error) =>
              onDeviceError?.({ source: Track.Source.Microphone, error })
            }
          />
          <VideoDeviceControl
            onDeviceError={(error) =>
              onDeviceError?.({ source: Track.Source.Camera, error })
            }
          />
          <HandToggle />
          <Button
            square
            variant="primaryDark"
            aria-label={t('options.buttonLabel')}
            tooltip={t('options.buttonLabel')}
            onPress={() => setIsMenuOpened(true)}
          >
            <RiMore2Line />
          </Button>
        </div>
      </div>
      <ResponsiveMenu
        isOpened={isMenuOpened}
        onClosed={() => setIsMenuOpened(false)}
      >
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
            {browserSupportsScreenSharing && (
              <ScreenShareToggle
                onDeviceError={(error) =>
                  onDeviceError?.({ source: Track.Source.ScreenShare, error })
                }
                variant="primaryTextDark"
                description={true}
                onPress={() => setIsMenuOpened(false)}
              />
            )}
            <ChatToggle
              description={true}
              onPress={() => setIsMenuOpened(false)}
            />
            <ParticipantsToggle
              description={true}
              onPress={() => setIsMenuOpened(false)}
            />
            <ToolsToggle
              description={true}
              onPress={() => setIsMenuOpened(false)}
            />
            <Button
              onPress={() => {
                toggleEffects()
                setIsMenuOpened(false)
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
                onPress={() => setIsMenuOpened(false)}
              >
                <RiMegaphoneLine size={20} />
              </LinkButton>
            )}
            <Button
              onPress={() => {
                openSettingsDialog()
                setIsMenuOpened(false)
              }}
              variant="primaryTextDark"
              aria-label={t('options.items.settings')}
              tooltip={t('options.items.settings')}
              description={true}
            >
              <RiSettings3Line size={20} />
            </Button>
            <CameraSwitchButton onPress={() => setIsMenuOpened(false)} />
          </div>
        </div>
      </ResponsiveMenu>
    </>
  )
}

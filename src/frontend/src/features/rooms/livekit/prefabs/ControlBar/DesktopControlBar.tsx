import { supportsScreenSharing } from '@livekit/components-core'
import { ControlBarAuxProps } from './ControlBar'
import { css } from '@/styled-system/css'
import { LeaveButton } from '../../components/controls/LeaveButton'
import { Track } from 'livekit-client'
import { ReactionsToggle } from '../../components/controls/ReactionsToggle'
import { HandToggle } from '../../components/controls/HandToggle'
import { ScreenShareToggle } from '../../components/controls/ScreenShareToggle'
import { SubtitlesToggle } from '../../components/controls/SubtitlesToggle'
import { OptionsButton } from '../../components/controls/Options/OptionsButton'
import { StartMediaButton } from '../../components/controls/StartMediaButton'
import { MoreOptions } from './MoreOptions'
import { useRef } from 'react'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { openShortcutHelp } from '@/stores/shortcutHelp'
import { VideoDeviceControl } from '../../components/controls/Device/VideoDeviceControl'
import { AudioDevicesControl } from '../../components/controls/Device/AudioDevicesControl'
import { useSidePanel } from '../../hooks/useSidePanel'
import { useFullScreen } from '../../hooks/useFullScreen'
import { useSettingsDialog } from '@/features/settings/hook/useSettingsDialog'
import { SettingsDialogExtendedKey } from '@/features/settings/type'

export function DesktopControlBar({
  onDeviceError,
}: Readonly<ControlBarAuxProps>) {
  const browserSupportsScreenSharing = supportsScreenSharing()
  const desktopControlBarEl = useRef<HTMLDivElement>(null)
  const { toggleParticipants, toggleChat, openScreenRecording } = useSidePanel()
  const { toggleFullScreen, isFullscreenAvailable } = useFullScreen({})
  const { openSettingsDialog } = useSettingsDialog()

  useRegisterKeyboardShortcut({
    shortcut: { key: '/', ctrlKey: true },
    handler: () => {
      openShortcutHelp()
    },
  })

  // Keep legacy behavior: F2 focuses the first button in the bottom toolbar.
  useRegisterKeyboardShortcut({
    shortcut: { key: 'F2' },
    handler: () => {
      const root = desktopControlBarEl.current
      if (!root) return
      const firstButton = root.querySelector<HTMLButtonElement>(
        'button, [role="button"], [tabindex="0"]'
      )
      firstButton?.focus()
    },
  })

  useRegisterKeyboardShortcut({
    shortcut: { key: 'P', ctrlKey: true, shiftKey: true },
    handler: () => toggleParticipants(),
  })

  useRegisterKeyboardShortcut({
    shortcut: { key: 'C', ctrlKey: true, shiftKey: true },
    handler: () => toggleChat(),
  })

  useRegisterKeyboardShortcut({
    shortcut: { key: 'F', ctrlKey: true, shiftKey: true },
    handler: () => {
      if (!isFullscreenAvailable) return
      toggleFullScreen()
    },
  })

  useRegisterKeyboardShortcut({
    shortcut: { key: 'L', ctrlKey: true, shiftKey: true },
    handler: () => openScreenRecording(),
  })

  useRegisterKeyboardShortcut({
    shortcut: { key: 'K', ctrlKey: true, altKey: true },
    handler: () => openSettingsDialog(SettingsDialogExtendedKey.SHORTCUTS),
  })
  return (
    <div
      ref={desktopControlBarEl}
      className={css({
        width: '100vw',
        display: 'flex',
        position: 'absolute',
        padding: '1.125rem',
        bottom: 0,
        left: 0,
        right: 0,
      })}
    >
      <div
        className={css({
          display: 'flex',
          justifyContent: 'flex-start',
          flex: '1 1 33%',
          alignItems: 'center',
          gap: '0.5rem',
          marginLeft: '0.5rem',
        })}
      />
      <div
        className={css({
          flex: '1 1 33%',
          alignItems: 'center',
          justifyContent: 'center',
          display: 'flex',
          gap: '0.65rem',
        })}
      >
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
        <ReactionsToggle />
        {browserSupportsScreenSharing && (
          <ScreenShareToggle
            onDeviceError={(error) =>
              onDeviceError?.({ source: Track.Source.ScreenShare, error })
            }
          />
        )}
        <SubtitlesToggle />
        <HandToggle />
        <OptionsButton />
        <LeaveButton />
        <StartMediaButton />
      </div>
      <MoreOptions parentElement={desktopControlBarEl} />
    </div>
  )
}

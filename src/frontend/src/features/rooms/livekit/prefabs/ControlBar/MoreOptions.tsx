import { css } from '@/styled-system/css'
import { ChatToggle } from '../../components/controls/ChatToggle'
import { ParticipantsToggle } from '../../components/controls/ParticipantsToggle'
import { ToolsToggle } from '../../components/controls/ToolsToggle'
import { InfoToggle } from '../../components/controls/InfoToggle'
import { AdminToggle } from '../../components/AdminToggle'
import { useSize } from '../../hooks/useResizeObserver'
import { useState, RefObject, useEffect } from 'react'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { Button } from '@/primitives'
import type { ToggleButtonProps } from '@/primitives/ToggleButton'
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

const CONTROL_BAR_BREAKPOINT = 1100

const NavigationControls = ({
  onPress,
  tooltipType = 'instant',
}: Partial<ToggleButtonProps>) => (
  <>
    <InfoToggle onPress={onPress} tooltipType={tooltipType} />
    <ChatToggle onPress={onPress} tooltipType={tooltipType} />
    <ParticipantsToggle onPress={onPress} tooltipType={tooltipType} />
    <ToolsToggle onPress={onPress} tooltipType={tooltipType} />
    <AdminToggle onPress={onPress} tooltipType={tooltipType} />
  </>
)

export const LateralMenu = () => {
  const { t } = useTranslation('rooms')
  const [isOpen, setIsOpen] = useState(false)

  const handlePress = () => setIsOpen(!isOpen)
  const handleClose = () => setIsOpen(false)

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        id="controlbar-more-options-trigger"
        square
        variant="secondaryDark"
        aria-label={t('controls.moreOptions')}
        tooltip={t('controls.moreOptions')}
        onPress={handlePress}
      >
        {isOpen ? <RiArrowDownSLine /> : <RiArrowUpSLine />}
      </Button>
      <Popover>
        <Dialog
          className={css({
            width: '65px',
            backgroundColor: 'primaryDark.50',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: '4px',
            paddingTop: '10px',
            gap: '0.5rem',
          })}
        >
          <NavigationControls onPress={handleClose} tooltipType="delayed" />
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}

interface BreakpointObserverProps {
  containerRef: RefObject<HTMLDivElement>
  onWideChange: (isWide: boolean) => void
}

const BreakpointObserver = ({
  containerRef,
  onWideChange,
}: BreakpointObserverProps) => {
  const { width } = useSize(containerRef)
  const isWide = width > CONTROL_BAR_BREAKPOINT

  useEffect(() => {
    onWideChange(isWide)
  }, [isWide, onWideChange])

  return null
}

export const MoreOptions = ({
  parentElement,
}: {
  parentElement: RefObject<HTMLDivElement>
}) => {
  const [isWide, setIsWide] = useState(false)

  return (
    <nav
      className={css({
        display: 'flex',
        justifyContent: 'flex-end',
        flex: '1 1 33%',
        alignItems: 'center',
        gap: '0.5rem',
        paddingRight: '0.25rem',
      })}
    >
      <BreakpointObserver
        containerRef={parentElement}
        onWideChange={setIsWide}
      />
      {isWide ? <NavigationControls /> : <LateralMenu />}
    </nav>
  )
}

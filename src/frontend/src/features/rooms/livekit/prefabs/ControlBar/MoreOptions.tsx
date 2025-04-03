import { css } from '@/styled-system/css'
import { ChatToggle } from '../../components/controls/ChatToggle'
import { ParticipantsToggle } from '../../components/controls/Participants/ParticipantsToggle'
import { SupportToggle } from '../../components/controls/SupportToggle'
import { TranscriptToggle } from '../../components/controls/TranscriptToggle'
import { AdminToggle } from '../../components/AdminToggle'
import { useSize } from '../../hooks/useResizeObserver'
import { useState, RefObject } from 'react'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { Button } from '@/primitives'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

const CONTROL_BAR_BREAKPOINT = 1100

const NavigationControls = ({
  onPress,
  tooltipType = 'instant',
}: Partial<ToggleButtonProps>) => (
  <>
    <ChatToggle onPress={onPress} tooltipType={tooltipType} />
    <ParticipantsToggle onPress={onPress} tooltipType={tooltipType} />
    <TranscriptToggle onPress={onPress} tooltipType={tooltipType} />
    <SupportToggle onPress={onPress} tooltipType={tooltipType} />
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

export const MoreOptions = ({
  parentElement,
}: {
  parentElement: RefObject<HTMLDivElement>
}) => {
  const { width: parentWidth } = useSize(parentElement)
  return (
    <div
      className={css({
        display: 'flex',
        justifyContent: 'flex-end',
        flex: '1 1 33%',
        alignItems: 'center',
        gap: '0.5rem',
        paddingRight: '0.25rem',
      })}
    >
      {parentWidth > CONTROL_BAR_BREAKPOINT ? (
        <NavigationControls />
      ) : (
        <LateralMenu />
      )}
    </div>
  )
}

import { css } from '@/styled-system/css'
import { useState } from 'react'
import { Dialog, DialogTrigger } from 'react-aria-components'
import { Button } from '@/primitives'
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { StyledPopover } from '@/primitives/Popover'
import { useOverlayBoundaryElement } from '@/primitives/useOverlayPortalContainer'
import { ChatToggle } from './ChatToggle'
import { ParticipantsToggle } from './Participants/ParticipantsToggle'
import { ToolsToggle } from './ToolsToggle'
import { InfoToggle } from './InfoToggle'
import { AdminToggle } from '../AdminToggle'

const NavigationControls = ({ onPress }: { onPress?: () => void }) => (
  <>
    <InfoToggle onPress={onPress} tooltipType="delayed" />
    <ChatToggle onPress={onPress} tooltipType="delayed" />
    <ParticipantsToggle onPress={onPress} tooltipType="delayed" />
    <ToolsToggle onPress={onPress} tooltipType="delayed" />
    <AdminToggle onPress={onPress} tooltipType="delayed" />
  </>
)

/**
 * PiP chevron menu that exposes Info/Chat/Participants/Tools/Admin.
 */
export const PipLateralMenu = () => {
  const { t } = useTranslation('rooms')
  const [isOpen, setIsOpen] = useState(false)
  const boundaryElement = useOverlayBoundaryElement()

  const handlePress = () => setIsOpen(!isOpen)
  const handleClose = () => setIsOpen(false)

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        id="pip-controlbar-more-options-trigger"
        square
        variant="secondaryDark"
        aria-label={t('controls.moreOptions')}
        tooltip={t('controls.moreOptions')}
        onPress={handlePress}
      >
        {isOpen ? <RiArrowDownSLine /> : <RiArrowUpSLine />}
      </Button>
      <StyledPopover placement="top" boundaryElement={boundaryElement}>
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
          <NavigationControls onPress={handleClose} />
        </Dialog>
      </StyledPopover>
    </DialogTrigger>
  )
}


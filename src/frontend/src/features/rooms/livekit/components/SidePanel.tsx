import { layoutStore } from '@/stores/layout'
import { css } from '@/styled-system/css'
import { Heading } from 'react-aria-components'
import { text } from '@/primitives/Text'
import { Box, Button, Div } from '@/primitives'
import { RiCloseLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ParticipantsList } from './controls/Participants/ParticipantsList'
import { useSidePanel } from '../hooks/useSidePanel'
import { ReactNode } from 'react'
import { Chat } from '../prefabs/Chat'
import { Transcript } from './Transcript'
import { Effects } from './effects/Effects'
import { Admin } from './Admin'

type StyledSidePanelProps = {
  title: string
  children: ReactNode
  onClose: () => void
  isClosed: boolean
  closeButtonTooltip: string
}

const StyledSidePanel = ({
  title,
  children,
  onClose,
  isClosed,
  closeButtonTooltip,
}: StyledSidePanelProps) => (
  <Box
    size="sm"
    className={css({
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      margin: '1.5rem 1.5rem 1.5rem 0',
      padding: 0,
      gap: 0,
      right: 0,
      top: 0,
      bottom: '80px',
      width: '360px',
      position: 'absolute',
      transition: '.5s cubic-bezier(.4,0,.2,1) 5ms',
    })}
    style={{
      transform: isClosed ? 'translateX(calc(360px + 1.5rem))' : 'none',
    }}
  >
    <Heading
      slot="title"
      level={1}
      className={text({ variant: 'h2' })}
      style={{
        paddingLeft: '1.5rem',
        paddingTop: '1rem',
        display: isClosed ? 'none' : undefined,
      }}
    >
      {title}
    </Heading>
    <Div
      position="absolute"
      top="5"
      right="5"
      style={{
        display: isClosed ? 'none' : undefined,
      }}
    >
      <Button
        invisible
        variant="tertiaryText"
        size="xs"
        onPress={onClose}
        aria-label={closeButtonTooltip}
        tooltip={closeButtonTooltip}
      >
        <RiCloseLine />
      </Button>
    </Div>
    {children}
  </Box>
)

type PanelProps = {
  isOpen: boolean
  children: React.ReactNode
}

const Panel = ({ isOpen, children }: PanelProps) => (
  <div
    style={{
      display: isOpen ? 'inherit' : 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      flexGrow: 1,
    }}
  >
    {children}
  </div>
)

export const SidePanel = () => {
  const {
    activePanelId,
    isParticipantsOpen,
    isEffectsOpen,
    isChatOpen,
    isSidePanelOpen,
    isTranscriptOpen,
    isAdminOpen,
  } = useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'sidePanel' })

  return (
    <StyledSidePanel
      title={t(`heading.${activePanelId}`)}
      onClose={() => (layoutStore.activePanelId = null)}
      closeButtonTooltip={t('closeButton', {
        content: t(`content.${activePanelId}`),
      })}
      isClosed={!isSidePanelOpen}
    >
      <Panel isOpen={isParticipantsOpen}>
        <ParticipantsList />
      </Panel>
      <Panel isOpen={isEffectsOpen}>
        <Effects />
      </Panel>
      <Panel isOpen={isChatOpen}>
        <Chat />
      </Panel>
      <Panel isOpen={isTranscriptOpen}>
        <Transcript />
      </Panel>
      <Panel isOpen={isAdminOpen}>
        <Admin />
      </Panel>
    </StyledSidePanel>
  )
}

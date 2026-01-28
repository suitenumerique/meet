import { layoutStore } from '@/stores/layout'
import { css } from '@/styled-system/css'
import { Heading } from 'react-aria-components'
import { text } from '@/primitives/Text'
import { Button, Div } from '@/primitives'
import { RiArrowLeftLine, RiCloseLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ParticipantsList } from './controls/Participants/ParticipantsList'
import { useSidePanel } from '../hooks/useSidePanel'
import { ReactNode } from 'react'
import { Chat } from '../prefabs/Chat'
import { Effects } from './effects/Effects'
import { Admin } from './Admin'
import { Tools } from './Tools'
import { Info } from './Info'
import { useSidePanelRef } from '../hooks/useSidePanelRef'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { HStack } from '@/styled-system/jsx'

type StyledSidePanelProps = {
  title: string
  ariaLabel: string
  children: ReactNode
  onClose: () => void
  isClosed: boolean
  closeButtonTooltip: string
  isSubmenu: boolean
  onBack: () => void
  panelRef: React.RefObject<HTMLElement>
  backButtonLabel: string
}

const StyledSidePanel = ({
  title,
  ariaLabel,
  children,
  onClose,
  isClosed,
  closeButtonTooltip,
  isSubmenu = false,
  onBack,
  panelRef,
  backButtonLabel,
}: StyledSidePanelProps) => (
  <aside
    ref={panelRef}
    className={css({
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'box.border',
      backgroundColor: 'box.bg',
      color: 'box.text',
      borderRadius: 8,
      flex: 1,
      position: 'absolute',
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
      transition: '.5s cubic-bezier(.4,0,.2,1) 5ms',
    })}
    style={{
      transform: isClosed ? 'translateX(calc(360px + 1.5rem))' : 'none',
    }}
    aria-hidden={isClosed}
    aria-label={ariaLabel}
  >
    <HStack alignItems="center">
      {isSubmenu && (
        <Button
          variant="secondaryText"
          size="sm"
          square
          className={css({ marginRight: '0.5rem', marginLeft: '1rem' })}
          aria-label={backButtonLabel}
          onPress={onBack}
        >
          <RiArrowLeftLine size={20} aria-hidden="true" />
        </Button>
      )}
      <Heading
        slot="title"
        level={1}
        className={text({ variant: 'h2' })}
        style={{
          paddingLeft: isSubmenu ? 0 : '1.5rem',
          paddingTop: '1rem',
          display: isClosed ? 'none' : 'flex',
          justifyContent: 'start',
          alignItems: 'center',
        }}
      >
        {title}
      </Heading>
    </HStack>
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
  </aside>
)

type PanelProps = {
  isOpen: boolean
  children: React.ReactNode
  keepAlive?: boolean
}

const Panel = ({ isOpen, keepAlive = false, children }: PanelProps) => (
  <div
    style={{
      display: isOpen ? 'inherit' : 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      flexGrow: 1,
    }}
  >
    {keepAlive || isOpen ? children : null}
  </div>
)
const SidePanelContent = () => {
  const {
    activePanelId,
    isParticipantsOpen,
    isEffectsOpen,
    isChatOpen,
    isSidePanelOpen,
    isToolsOpen,
    isAdminOpen,
    isInfoOpen,
    isSubPanelOpen,
    activeSubPanelId,
  } = useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'sidePanel' })
  const panelRef = useSidePanelRef()

  useEscapeKey(
    () => {
      // Close subpanel + panel together for a consistent Escape behavior
      if (isSubPanelOpen) {
        layoutStore.activeSubPanelId = null
        layoutStore.activePanelId = null
        return
      }
      layoutStore.activePanelId = null
    },
    {
      isActive: isSidePanelOpen,
      capture: true,
    }
  )

  return (
    <StyledSidePanel
      title={t(`heading.${activeSubPanelId || activePanelId}`)}
      ariaLabel={t('ariaLabel')}
      onClose={() => {
        layoutStore.activePanelId = null
        layoutStore.activeSubPanelId = null
      }}
      closeButtonTooltip={t('closeButton', {
        content: t(`content.${activeSubPanelId || activePanelId}`),
      })}
      isClosed={!isSidePanelOpen}
      isSubmenu={isSubPanelOpen}
      backButtonLabel={t('backToTools')}
      onBack={() => (layoutStore.activeSubPanelId = null)}
      panelRef={panelRef}
    >
      {/* keepAlive stays only for Info to reduce memory footprint */}
      <Panel isOpen={isParticipantsOpen}>
        <ParticipantsList />
      </Panel>
      <Panel isOpen={isEffectsOpen}>
        <Effects />
      </Panel>
      <Panel isOpen={isChatOpen} keepAlive={true}>
        <Chat />
      </Panel>
      <Panel isOpen={isToolsOpen} keepAlive={true}>
        <Tools />
      </Panel>
      <Panel isOpen={isAdminOpen}>
        <Admin />
      </Panel>
      <Panel isOpen={isInfoOpen} >
        <Info />
      </Panel>
    </StyledSidePanel>
  )
}

export const SidePanel = () => {
  return <SidePanelContent />
}

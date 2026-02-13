import { css } from '@/styled-system/css'
import { Heading } from 'react-aria-components'
import { text } from '@/primitives/Text'
import { Button, Div } from '@/primitives'
import { RiArrowLeftLine, RiCloseLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ParticipantsList } from './controls/Participants/ParticipantsList'
import { type SidePanelStore, useSidePanel } from '../hooks/useSidePanel'
import { ReactNode } from 'react'
import { Chat } from '../prefabs/Chat'
import { Effects } from './effects/Effects'
import { Admin } from './Admin'
import { Tools } from './Tools'
import { Info } from './Info'
import { HStack } from '@/styled-system/jsx'
import { useReactionsToolbar } from '@/features/reactions/hooks/useReactionsToolbar'

type StyledSidePanelProps = {
  title: string
  ariaLabel: string
  children: ReactNode
  onClose: () => void
  isClosed: boolean
  closeButtonTooltip: string
  isSubmenu: boolean
  onBack: () => void
  backButtonLabel: string
  isReactionToolbarOpen?: boolean
}

const StyledSidePanel = ({
  title,
  ariaLabel,
  children,
  onClose,
  isClosed,
  isReactionToolbarOpen,
  closeButtonTooltip,
  isSubmenu = false,
  onBack,
  backButtonLabel,
}: StyledSidePanelProps) => (
  <aside
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
      margin: 'var(--sizes-room-side-panel-margin)',
      marginLeft: 0,
      marginBottom: 0,
      padding: 0,
      gap: 0,
      right: 0,
      top: 0,
      width: 'var(--sizes-room-side-panel)',
      transition: '.5s cubic-bezier(.4,0,.2,1) 5ms',
    })}
    style={{
      transform: isClosed
        ? 'translateX(calc(var(--sizes-room-side-panel) + var(--sizes-room-side-panel-margin)))'
        : 'none',
      bottom: isReactionToolbarOpen
        ? 'calc( var(--sizes-room-control-bar) + var(--sizes-room-reaction-toolbar-height) + calc(var(--lk-grid-gap) / 2))'
        : 'var(--sizes-room-control-bar)',
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
export const SidePanel = ({ store }: { store?: SidePanelStore }) => {
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
    closePanel,
    goBack,
  } = useSidePanel(store)
  const { t } = useTranslation('rooms', { keyPrefix: 'sidePanel' })
  const title = t(`heading.${activeSubPanelId || activePanelId}`)

  const { isOpen: isReactionToolbarOpen } = useReactionsToolbar()

  return (
    <StyledSidePanel
      title={title}
      ariaLabel={t('ariaLabel', { title })}
      onClose={closePanel}
      closeButtonTooltip={t('closeButton', {
        content: t(`content.${activeSubPanelId || activePanelId}`),
      })}
      isClosed={!isSidePanelOpen}
      isSubmenu={isSubPanelOpen}
      isReactionToolbarOpen={isReactionToolbarOpen}
      backButtonLabel={t('backToTools')}
      onBack={goBack}
    >
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
      <Panel isOpen={isInfoOpen}>
        <Info />
      </Panel>
    </StyledSidePanel>
  )
}

import { ReactNode, useId, useState } from 'react'
import { css } from '@/styled-system/css'
import { styled, VStack } from '@/styled-system/jsx'
import { Icon } from '@/primitives/Icon'

const Container = styled('div', {
  base: {
    border: '1px solid',
    borderColor: 'gray.100',
    borderRadius: 4,
    marginBottom: '0.9375rem',
  },
})

const Header = styled('button', {
  base: {
    minHeight: '2.5rem',
    paddingLeft: '1.25rem',
    paddingRight: '1rem',
    paddingY: '0.5rem',
    gap: '0.5rem',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    fontSize: '1rem',
    transition: 'background 200ms',
    borderTopRadius: '3px', // container radius (4) minus its 1px border
    _hover: { backgroundColor: 'background.semantic.contextual.primary' },
  },
  variants: {
    isOpen: { false: { borderRadius: '3px' } },
  },
})

const HeaderCell = styled('span', {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '34px',
  },
})

const Chevron = styled(Icon, {
  base: { transition: 'transform 200ms', flexShrink: 0 },
  variants: {
    isOpen: { false: { transform: 'rotate(180deg)' } },
  },
})

const List = styled(VStack, {
  base: {
    borderTop: '1px solid',
    borderTopColor: 'gray.100',
    alignItems: 'start',
    minHeight: 0,
    flexGrow: 1,
    paddingY: '0.5rem',
    paddingX: '1rem',
    gap: 0,
  },
})

export type ParticipantsCollapsibleSectionProps = {
  heading: string
  count: number
  action?: ReactNode
  children: ReactNode
}

export const ParticipantsCollapsibleSection = ({
  heading,
  count,
  action,
  children,
}: ParticipantsCollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(true)
  const listId = useId()
  return (
    <Container>
      <Header
        type="button"
        isOpen={isOpen}
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={css({ flex: 1, minWidth: 0, textAlign: 'start' })}>
          {heading}
        </span>
        <HeaderCell>{count}</HeaderCell>
        <HeaderCell>
          <Chevron name="chevron-up" size={22} isOpen={isOpen} />
        </HeaderCell>
      </Header>
      {isOpen && (
        <List id={listId} role="list">
          {action}
          {children}
        </List>
      )}
    </Container>
  )
}

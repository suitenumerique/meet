import { ReactNode, useId, useState } from 'react'
import { RiArrowUpSLine } from '@remixicon/react'
import { styled, HStack, VStack } from '@/styled-system/jsx'

const Container = styled('div', {
  base: {
    border: '1px solid',
    borderColor: 'greyscale.250',
    borderRadius: '8px',
    margin: '0 .625rem 0.9375rem',
  },
})

const Header = styled('button', {
  base: {
    minHeight: '2.5rem',
    paddingX: '1.25rem',
    paddingY: '0.5rem',
    gap: '0.5rem',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    fontSize: '1rem',
    transition: 'background 200ms',
    borderTopRadius: '7px', // container radius (8) minus its 1px border
    _hover: { backgroundColor: 'greyscale.50' },
  },
  variants: {
    isOpen: { false: { borderRadius: '7px' } },
  },
})

const Chevron = styled(RiArrowUpSLine, {
  base: { transition: 'transform 200ms', flexShrink: 0 },
  variants: {
    isOpen: { false: { transform: 'rotate(180deg)' } },
  },
})

const List = styled(VStack, {
  base: {
    borderTop: '1px solid',
    borderTopColor: 'greyscale.250',
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
        <HStack justify="space-between" width="100%">
          <span>{heading}</span>
          <span>{count}</span>
        </HStack>
        <Chevron size={32} isOpen={isOpen} aria-hidden />
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

import { ReactNode, useState } from 'react'
import { css } from '@/styled-system/css'
import { ToggleButton } from 'react-aria-components'
import { HStack, styled, VStack } from '@/styled-system/jsx'
import { RiArrowUpSLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

const ToggleHeader = styled(ToggleButton, {
  base: {
    minHeight: '40px', //fixme hardcoded value
    paddingRight: '.5rem',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    transition: 'background 200ms',
    borderTopRadius: '7px',
    '&[data-hovered]': {
      backgroundColor: 'greyscale.50',
    },
  },
})

const Container = styled('div', {
  base: {
    border: '1px solid',
    borderColor: 'greyscale.250',
    borderRadius: '8px',
    margin: '0 .625rem',
  },
})

const ListContainer = styled(VStack, {
  base: {
    borderTop: '1px solid',
    borderTopColor: 'greyscale.250',
    alignItems: 'start',
    overflowY: 'scroll',
    overflowX: 'hidden',
    minHeight: 0,
    flexGrow: 1,
    display: 'flex',
    paddingY: '0.5rem',
    paddingX: '1rem',
    gap: 0,
  },
})

export type ParticipantsCollapsableListProps<T> = {
  heading: string
  participants: Array<T>
  renderParticipant: (participant: T) => JSX.Element
  action?: ReactNode
}

export function ParticipantsCollapsableList<T>({
  heading,
  participants,
  renderParticipant,
  action,
}: ParticipantsCollapsableListProps<T>) {
  const { t } = useTranslation('rooms')
  const [isOpen, setIsOpen] = useState(true)
  const label = t(`participants.collapsable.${isOpen ? 'close' : 'open'}`, {
    name: heading,
  })
  return (
    <Container>
      <ToggleHeader
        isSelected={isOpen}
        aria-label={label}
        data-focus-target="list-header"
        onPress={() => setIsOpen(!isOpen)}
        style={{
          borderRadius: !isOpen ? '7px' : undefined,
        }}
      >
        <HStack
          justify="space-between"
          className={css({
            margin: '0 1.25rem',
            width: '100%',
          })}
        >
          <div
            className={css({
              fontSize: '1rem',
            })}
          >
            {heading}
          </div>
          <div>{participants?.length || 0}</div>
        </HStack>
        <RiArrowUpSLine
          size={32}
          style={{
            transform: isOpen ? 'rotate(-180deg)' : undefined,
            transition: 'transform 200ms',
          }}
        />
      </ToggleHeader>
      {isOpen && (
        <ListContainer>
          {action}
          {participants.map((participant) => renderParticipant(participant))}
        </ListContainer>
      )}
    </Container>
  )
}

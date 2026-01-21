import React from 'react'
import { RiMoreFill } from '@remixicon/react'
import { Box, Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { OptionsMenuItems } from './OptionsMenuItems'

type PipOptionsMenuProps = {
  wrapperRef: React.RefObject<HTMLDivElement>
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  label: string
}

export const PipOptionsMenu = ({
  wrapperRef,
  isOpen,
  setIsOpen,
  label,
}: PipOptionsMenuProps) => {
  return (
    <div
      ref={wrapperRef}
      className={css({
        position: 'relative',
      })}
    >
      <Button
        id="room-options-trigger"
        square
        variant="primaryDark"
        aria-label={label}
        tooltip={label}
        onPress={() => setIsOpen(!isOpen)}
      >
        <RiMoreFill />
      </Button>
      {isOpen && (
        <div
          className={css({
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% + 0.85rem)',
            transform: 'translateX(-50%)',
            zIndex: 10,
          })}
        >
          <Box size="sm" type="popover" variant="dark">
            <OptionsMenuItems />
          </Box>
        </div>
      )}
    </div>
  )
}
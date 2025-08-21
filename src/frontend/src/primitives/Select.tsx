import { type ReactNode } from 'react'
import { styled } from '@/styled-system/jsx'
import { RemixiconComponentType, RiArrowDropDownLine } from '@remixicon/react'
import {
  Button,
  ListBox,
  ListBoxItem,
  Select as RACSelect,
  SelectProps,
  SelectValue,
} from 'react-aria-components'
import { Box } from './Box'
import { StyledPopover } from './Popover'
import { menuRecipe } from '@/primitives/menuRecipe.ts'
import { css } from '@/styled-system/css'
import type { Placement } from '@react-types/overlays'

const StyledButton = styled(Button, {
  base: {
    width: 'full',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingY: 0.125,
    paddingX: 0.25,
    border: '1px solid',
    borderColor: 'control.border',
    color: 'control.text',
    borderRadius: 4,
    boxShadow: '0 1px 2px rgba(0 0 0 / 0.1)',
    '&[data-focus-visible]': {
      outline: '2px solid {colors.focusRing}',
      outlineOffset: '-1px',
    },
    '&[data-pressed]': {
      backgroundColor: 'control.hover',
    },
    // fixme disabled style is being overridden by placeholder one and needs refinement.
    '&[data-disabled]': {
      color: 'default.subtle-text',
      borderColor: 'gray.200',
      boxShadow: '0 1px 2px rgba(0 0 0 / 0.02)',
    },
  },
})

const StyledSelectValue = styled(SelectValue, {
  base: {
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    textWrap: 'nowrap',
    '&[data-placeholder]': {
      color: 'default.subtle-text',
      fontStyle: 'italic',
    },
  },
})

const StyledIcon = styled('div', {
  base: {
    marginRight: '0.35rem',
    flexShrink: 0,
  },
})

export const Select = <T extends string | number>({
  label,
  iconComponent,
  items,
  errors,
  placement,
  ...props
}: Omit<SelectProps<object>, 'items' | 'label' | 'errors'> & {
  iconComponent?: RemixiconComponentType
  label: ReactNode
  items: Array<{ value: T; label: ReactNode }>
  errors?: ReactNode
  placement?: Placement
}) => {
  const IconComponent = iconComponent
  return (
    <RACSelect {...props}>
      {label}
      <StyledButton>
        {!!IconComponent && (
          <StyledIcon>
            <IconComponent size={18} />
          </StyledIcon>
        )}
        <StyledSelectValue />
        <RiArrowDropDownLine
          aria-hidden="true"
          className={css({ flexShrink: 0 })}
        />
      </StyledButton>
      <StyledPopover placement={placement}>
        <Box size="sm" type="popover" variant="control">
          <ListBox>
            {items.map((item) => (
              <ListBoxItem
                className={
                  menuRecipe({ extraPadding: true, variant: 'light' }).item
                }
                id={item.value}
                key={item.value}
              >
                {item.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </Box>
      </StyledPopover>
      {errors}
    </RACSelect>
  )
}

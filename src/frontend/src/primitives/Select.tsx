import { type ReactNode } from 'react'
import { styled, VisuallyHidden } from '@/styled-system/jsx'
import {
  Button,
  ListBox,
  ListBoxItem,
  Select as RACSelect,
  SelectProps as RACSelectProps,
  SelectValue,
} from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { Box } from './Box'
import { Icon, type IconName } from './Icon'
import { StyledPopover } from './StyledPopover'
import { menuRecipe } from '@/primitives/menuRecipe.ts'
import { css, cx } from '@/styled-system/css'
import { chevronFlip } from '@/styles/animations'
import type { Placement } from '@react-types/overlays'

const StyledButton = styled(Button, {
  base: {
    width: 'full',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingY: '4xs',
    paddingX: '3xs',
    border: '1px solid',
    borderColor: 'border.semantic.neutral.tertiary',
    color: 'content.semantic.neutral.primary',
    borderRadius: 4,
    cursor: 'pointer',
    // The field of the UI kit: its border thickens on hover, with a ring of
    // the same color, and turns to the brand color when focused or open.
    boxShadow: '0 0 0 0 {colors.border.semantic.neutral.tertiary}',
    transition: 'border-color 250ms ease-out, box-shadow 250ms ease-out',
    '&[data-hovered]:not([data-focus-visible], [aria-expanded=true])': {
      boxShadow: '0 0 0 1px {colors.border.semantic.neutral.tertiary}',
    },
    '&[data-focus-visible], &[aria-expanded=true]': {
      borderColor: 'border.semantic.brand.primary',
      boxShadow: '0 0 0 1px {colors.border.semantic.brand.primary}',
      outline: 'none!',
    },
    '&[data-pressed]': {
      backgroundColor: 'background.semantic.neutral.tertiary-hover',
    },
    // fixme disabled style is being overridden by placeholder one and needs refinement.
    '&[data-disabled]': {
      cursor: 'default',
      color: 'content.semantic.neutral.secondary',
      borderColor: 'gray.100',
    },
  },
  variants: {
    variant: {
      light: {},
      dark: {
        backgroundColor: 'gray.700',
        borderColor: 'gray.550',
        fontWeight: 'medium !important',
        color: 'white',
        '&[data-hovered]:not([data-focus-visible], [aria-expanded=true])': {
          boxShadow: '0 0 0 1px {colors.gray.550}',
        },
        // a softer blue on dark surfaces: the one of the selected buttons of
        // the control bar
        '&[data-focus-visible], &[aria-expanded=true]': {
          borderColor: 'brand.250!',
          boxShadow: '0 0 0 1px {colors.brand.250}!',
        },
        '&[data-pressed]': {
          backgroundColor: 'gray.100',
          color: 'gray.700',
        },
        '&[data-hovered]': {
          backgroundColor: 'gray.550',
          color: 'white',
        },
        '&[data-selected]': {
          backgroundColor: 'gray.250 !important',
          color: 'gray.700 !important',
        },
      },
    },
  },
  defaultVariants: {
    variant: 'light',
  },
})

const StyledSelectValue = styled(SelectValue, {
  base: {
    flexGrow: 1,
    textAlign: 'start',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    textWrap: 'nowrap',
    '&[data-placeholder]': {
      color: 'content.semantic.neutral.secondary',
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

export type SelectProps<T> = Omit<
  RACSelectProps<object>,
  'items' | 'label' | 'errors'
> & {
  iconName?: IconName
  label: ReactNode
  items: Array<{ value: T; label: ReactNode; lang?: string }>
  errors?: ReactNode
  placement?: Placement
  variant?: 'light' | 'dark'
  menuFooter?: ReactNode
}

export const Select = <T extends string | number>({
  label,
  iconName,
  items,
  errors,
  placement,
  variant = 'light',
  menuFooter,
  ...props
}: SelectProps<T>) => {
  const { t } = useTranslation('global')
  return (
    <RACSelect {...props}>
      {({ isOpen }) => (
        <>
          {label}
          <StyledButton variant={variant}>
            {!!iconName && (
              <StyledIcon>
                <Icon name={iconName} size="sm" />
              </StyledIcon>
            )}
            <StyledSelectValue />
            <Icon
              name="arrow-drop-down"
              className={cx(chevronFlip, css({ flexShrink: 0 }))}
            />
          </StyledButton>
          <StyledPopover placement={placement}>
            <Box size="sm" type="popover" variant={variant}>
              <ListBox>
                {items.map((item) => (
                  <ListBoxItem
                    className={
                      menuRecipe({
                        extraPadding: true,
                        variant: variant,
                      }).item
                    }
                    id={item.value}
                    key={item.value}
                    textValue={
                      typeof item.label === 'string' ? item.label : undefined
                    }
                  >
                    {({ isSelected }) => (
                      <>
                        {item.lang ? (
                          <span lang={item.lang}>{item.label}</span>
                        ) : (
                          item.label
                        )}
                        {isSelected && (
                          <VisuallyHidden>, {t('selected')}</VisuallyHidden>
                        )}
                      </>
                    )}
                  </ListBoxItem>
                ))}
              </ListBox>
              {isOpen && menuFooter}
            </Box>
          </StyledPopover>
          {errors}
        </>
      )}
    </RACSelect>
  )
}

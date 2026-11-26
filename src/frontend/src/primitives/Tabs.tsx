import {
  Tabs as RACTabs,
  Tab as RACTab,
  TabPanel as RACTabPanel,
  TabList as RACTabList,
  TabProps as RACTabProps,
  TabsProps as RACTabsProps,
  TabListProps as RACTabListProps,
  TabPanelProps as RACTabPanelProps,
} from 'react-aria-components'
import { cx } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { scrollbar } from './scrollbar'
import { type StyledVariantProps } from '@/styled-system/types'
import React from 'react'

const StyledTabs = styled(RACTabs, {
  base: {
    display: 'flex',
    '&[data-orientation=horizontal]': {
      flexDirection: 'column',
      '--horizontal': '3px',
    },
    '&[data-orientation=vertical]': {
      flexDirection: 'row',
      '--vertical': '3px',
    },
    '&[data-focus-visible]': {
      outline: 'none!',
    },
  },
})

export type TabsProps = RACTabsProps & StyledVariantProps<typeof StyledTabs>

export const Tabs = ({ children, ...props }: TabsProps) => {
  return <StyledTabs {...props}>{children}</StyledTabs>
}

const StyledTab = styled(RACTab, {
  base: {
    padding: '10px',
    cursor: 'pointer',
    outline: 'none',
    position: 'relative',
    color: 'content.semantic.neutral.primary',
    borderColor: 'transparent',
    forcedColorAdjust: 'none',
  },
  variants: {
    border: {
      true: {
        '&[data-selected]': {
          borderColor: 'border.semantic.brand.primary',
        },
        borderBottom: 'var(--horizontal) solid',
        borderInlineEnd: 'var(--vertical) solid',
      },
      false: {
        border: 'none',
      },
    },
    // The item of the sidebar of a tabbed modal, in the UI kit
    highlight: {
      true: {
        boxSizing: 'border-box',
        height: '32px',
        padding: '0 0.5rem',
        borderRadius: 4,
        fontSize: 'sm',
        fontWeight: 'medium',
        whiteSpace: 'nowrap',
        transition: 'background 200ms',
        '&[data-hovered]': {
          backgroundColor: 'background.semantic.contextual.primary',
        },
        '&[data-selected]': {
          backgroundColor: 'background.semantic.contextual.primary-hover',
          fontWeight: 'bold',
        },
        '&[data-focus-visible]': {
          outline: '2px solid!',
          outlineColor: 'border.semantic.brand.primary!',
          outlineOffset: '2px!',
        },
        '& svg': {
          flexShrink: 0,
          width: '18px',
          height: '18px',
          color: 'content.semantic.neutral.tertiary',
        },
      },
    },
    icon: {
      true: {
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
      },
    },
  },
  compoundVariants: [
    {
      highlight: true,
      icon: true,
      css: { gap: '0.5rem' },
    },
  ],
  defaultVariants: {
    border: true,
    icon: false,
  },
})

export type TabProps = RACTabProps & StyledVariantProps<typeof StyledTab>

export const Tab = ({ children, ...props }: TabProps) => {
  const parentBorder = React.useContext(BorderContext)
  return (
    <StyledTab border={parentBorder} {...props}>
      {children}
    </StyledTab>
  )
}

const StyledTabList = styled(RACTabList, {
  base: {
    display: 'flex',
    '&[data-orientation=vertical]': {
      flexDirection: 'column',
    },
    '&[data-focus-visible]': {
      outline: 'none!',
    },
  },
  variants: {
    border: {
      false: {
        border: 'none',
      },
      true: {
        '&[data-orientation=horizontal]': {
          borderBottom: '1px solid',
          borderColor: 'gray.150',
        },
        '&[data-orientation=vertical]': {
          borderInlineEnd: '1px solid',
          borderColor: 'gray.150',
        },
      },
    },
  },
  defaultVariants: {
    border: true,
  },
})

// @fixme type could be simplified to avoid redefining the children props
export type TabListProps = {
  children: React.ReactNode
} & RACTabListProps<typeof Tab> &
  StyledVariantProps<typeof StyledTabList>

const BorderContext = React.createContext<boolean | undefined>(true)

export const TabList = ({ children, border, ...props }: TabListProps) => {
  return (
    <BorderContext.Provider value={border}>
      <StyledTabList {...props} border={border}>
        {children}
      </StyledTabList>
    </BorderContext.Provider>
  )
}

const StyledTabPanel = styled(RACTabPanel, {
  base: {
    marginTop: '4px',
    borderRadius: '4px',
    '&[data-focus-visible]': {
      outline: 'none!',
    },
  },
  variants: {
    flex: {
      true: {
        display: 'flex',
        flexGrow: 1,
        overflow: 'auto',
        flexDirection: 'column', //fixme should be parameterizable
      },
    },
    padding: {
      sm: {
        padding: '10px',
      },
      md: {
        padding: '2rem',
      },
    },
  },
  defaultVariants: {
    padding: 'sm',
    flex: false,
  },
})

export type TabPanelProps = RACTabPanelProps &
  StyledVariantProps<typeof StyledTabPanel>

export const TabPanel = ({ children, className, ...props }: TabPanelProps) => {
  return (
    <StyledTabPanel
      {...props}
      // a panel which fills its container scrolls
      className={
        props.flex && (className === undefined || typeof className === 'string')
          ? cx(scrollbar, className)
          : className
      }
    >
      {children}
    </StyledTabPanel>
  )
}

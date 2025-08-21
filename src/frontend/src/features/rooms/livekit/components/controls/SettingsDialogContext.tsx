import {
  SettingsDialogExtended,
  SettingsDialogExtendedKeys,
} from '@/features/settings/components/SettingsDialogExtended'
import React, { createContext, useContext, useState } from 'react'

const SettingsDialogContext = createContext<
  | {
      dialogOpen: boolean
      defaultSelectedKey?: SettingsDialogExtendedKeys
      setDefaultSelectedKey: React.Dispatch<
        React.SetStateAction<SettingsDialogExtendedKeys | undefined>
      >
      setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
    }
  | undefined
>(undefined)

export const SettingsDialogProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const [defaultSelectedKey, setDefaultSelectedKey] = useState<
    SettingsDialogExtendedKeys | undefined
  >(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <SettingsDialogContext.Provider
      value={{
        dialogOpen,
        setDialogOpen,
        defaultSelectedKey,
        setDefaultSelectedKey,
      }}
    >
      {children}
      <SettingsDialogExtended
        isOpen={dialogOpen}
        defaultSelectedKey={defaultSelectedKey}
        onOpenChange={(v) => {
          if (!v) {
            setDefaultSelectedKey(undefined)
          }
          setDialogOpen(v)
        }}
      />
    </SettingsDialogContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSettingsDialog = () => {
  const context = useContext(SettingsDialogContext)
  if (!context) {
    throw new Error(
      'useSettingsDialog must be used within a SettingsDialogProvider'
    )
  }
  return context
}

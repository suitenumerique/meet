import { createContext, useContext } from 'react'

interface EncryptionContextValue {
  pendingParticipants: Set<string>
}

const EncryptionContext = createContext<EncryptionContextValue>({
  pendingParticipants: new Set(),
})

export const EncryptionProvider = EncryptionContext.Provider
export const useEncryptionContext = () => useContext(EncryptionContext)

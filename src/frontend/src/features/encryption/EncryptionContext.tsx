import { createContext, useContext } from 'react'

interface EncryptionContextValue {
  symmetricKey?: Uint8Array
}

const EncryptionContext = createContext<EncryptionContextValue>({})

export const EncryptionProvider = EncryptionContext.Provider
export const useEncryptionContext = () => useContext(EncryptionContext)
